"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase";

// Reminds a legacy no-card free-trial user their access is about to lapse,
// offering the same one-time $10-for-the-season pricing as the original
// August promo (see app/api/checkout/route.js's trialOffer flag) instead of
// the standard $10/mo plan. Mounted from NavBar so it can show on any page;
// NavBar owns the "don't spam them" once-per-day gating.
export default function TrialReminderModal({ daysLeft, onClose }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleClaim() {
    setError("");
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ trialOffer: true }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.url) {
        setError(body?.error || "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      window.location.href = body.url;
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-card rounded-2xl shadow-2xl p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="4" y1="4" x2="16" y2="16" /><line x1="16" y1="4" x2="4" y2="16" />
          </svg>
        </button>

        <div className="text-center py-2">
          <p className="text-4xl mb-3">⏳</p>
          <h2 className="text-lg font-bold text-ink mb-2">
            {daysLeft <= 0 ? "Your free trial has ended" : `Your free trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
          </h2>
          <p className="text-sm text-gray-500 max-w-xs mx-auto mb-6">
            Add a payment method now and get the rest of the season for <strong>$10 total</strong> — the same deal as our August promo, instead of the regular $10/mo plan.
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 text-left">{error}</div>
          )}

          <button
            onClick={handleClaim}
            disabled={submitting}
            className="w-full bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-bold py-2.5 rounded-xl transition-all disabled:opacity-50 text-sm"
          >
            {submitting ? "Redirecting…" : "Get the season for $10"}
          </button>
          <button onClick={onClose} className="mt-3 text-sm text-gray-400 hover:text-gray-600 font-medium">
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
