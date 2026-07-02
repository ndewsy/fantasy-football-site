"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import NavBar from "@/app/components/NavBar";

const CREATOR_INFO = {
  dynastydave:          { name: "RookieRager",            path: "/creators/dynastydave" },
  redraftking:          { name: "FantasyFootballHuddle",  path: "/creators/redraftking" },
  rbguru:               { name: "RB Guru",                path: "/creators/rbguru" },
  wrtargets:            { name: "WR Targets",             path: "/creators/wrtargets" },
  rookierager:          { name: "RookieRager",            path: "/creators/dynastydave" },
  fantasyfootballhuddle:{ name: "FantasyFootballHuddle",  path: "/creators/redraftking" },
};

function parseAddOns(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      setUser(user);

      const { data: sub } = await supabase.from("subscriptions").select("*").eq("user_id", user.id).eq("status", "active").maybeSingle();
      setSubscription(sub || null);
      setLoading(false);
    }
    load();
  }, [router]);

  async function handleManageSubscription() {
    setPortalLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/portal", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error("Could not create portal session");
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      alert(err.message);
      setPortalLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading...
      </div>
    );
  }

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "—";

  const addOns = parseAddOns(subscription?.add_on_creators);
  const monthlyCost = subscription ? 10 + addOns.length * 5 : 0;
  const includedCreator = subscription?.included_creator;

  return (
    <main className="min-h-screen text-[#0F172A]">
      <NavBar activePath="/account" />

      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-10">My Account</h1>

        {/* Profile card */}
        <div className="bg-white/70 backdrop-blur-md rounded-xl border border-white/80 shadow-lg p-6 mb-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Profile</h2>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-500 text-sm">Email</span>
              <span className="font-medium break-all text-right">{user.email}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-500 text-sm">Member since</span>
              <span className="font-medium">{memberSince}</span>
            </div>
          </div>
        </div>

        {/* Subscription card */}
        <div className="bg-white/70 backdrop-blur-md rounded-xl border border-white/80 shadow-lg p-6 mb-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Subscription</h2>

          {!subscription ? (
            <div className="text-center py-4">
              <p className="text-gray-500 mb-4">You don't have an active subscription.</p>
              <a
                href="/subscribe"
                className="inline-block bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-bold px-6 py-3 rounded-xl transition-all"
              >
                Get Access — $10/mo
              </a>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Status badge */}
              <div className="flex items-center justify-between">
                <span className="text-gray-500 text-sm">Status</span>
                <span className="text-xs font-semibold bg-green-50 text-green-600 border border-green-200 px-2.5 py-1 rounded-full">
                  Active
                </span>
              </div>

              {/* Included community */}
              <div className="flex items-center justify-between">
                <span className="text-gray-500 text-sm">Included community</span>
                {includedCreator && CREATOR_INFO[includedCreator] ? (
                  <a
                    href={CREATOR_INFO[includedCreator].path}
                    className="font-medium text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    {CREATOR_INFO[includedCreator].name} →
                  </a>
                ) : (
                  <span className="font-medium text-gray-700">{includedCreator || "—"}</span>
                )}
              </div>

              {/* Add-on communities */}
              {addOns.length > 0 && (
                <div className="flex items-start justify-between gap-4">
                  <span className="text-gray-500 text-sm shrink-0 pt-0.5">Add-on communities</span>
                  <div className="flex flex-col items-end gap-1.5">
                    {addOns.map(id => (
                      CREATOR_INFO[id] ? (
                        <a
                          key={id}
                          href={CREATOR_INFO[id].path}
                          className="font-medium text-blue-600 hover:text-blue-700 transition-colors text-sm"
                        >
                          {CREATOR_INFO[id].name} →
                        </a>
                      ) : (
                        <span key={id} className="font-medium text-gray-700 text-sm">{id}</span>
                      )
                    ))}
                  </div>
                </div>
              )}

              {/* Cost breakdown */}
              <div className="border-t border-gray-100 pt-4 mt-1 flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Base plan</span>
                  <span>$10/mo</span>
                </div>
                {addOns.map(id => (
                  <div key={id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">
                      {CREATOR_INFO[id]?.name || id} add-on
                    </span>
                    <span>+$5/mo</span>
                  </div>
                ))}
                <div className="flex items-center justify-between font-bold mt-1">
                  <span>Total</span>
                  <span className="text-blue-600 text-lg">${monthlyCost}/mo</span>
                </div>
              </div>

              {/* Manage button */}
              <button
                onClick={handleManageSubscription}
                disabled={portalLoading}
                className="mt-2 w-full bg-white hover:bg-gray-50 border border-gray-200 text-[#0F172A] font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
              >
                {portalLoading ? "Redirecting..." : "Manage Subscription"}
              </button>
              <p className="text-gray-400 text-xs text-center -mt-2">
                Cancel or update billing via Stripe
              </p>
            </div>
          )}
        </div>

        {/* Quick links */}
        <div className="bg-white/70 backdrop-blur-md rounded-xl border border-white/80 shadow-lg p-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Quick Links</h2>
          <div className="flex flex-col gap-3">
            <a href="/" className="flex items-center justify-between text-gray-600 hover:text-gray-900 transition-colors text-sm">
              <span>Rankings</span>
              <span className="text-gray-400">→</span>
            </a>
            <a href="/creators" className="flex items-center justify-between text-gray-600 hover:text-gray-900 transition-colors text-sm">
              <span>Browse Creators</span>
              <span className="text-gray-400">→</span>
            </a>
            {includedCreator && CREATOR_INFO[includedCreator] && (
              <a
                href={CREATOR_INFO[includedCreator].path}
                className="flex items-center justify-between text-gray-600 hover:text-gray-900 transition-colors text-sm"
              >
                <span>{CREATOR_INFO[includedCreator].name} Community</span>
                <span className="text-gray-400">→</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
