"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import NavBar from "@/app/components/NavBar";
import { isPromoActive } from "@/lib/promo";

export default function SubscribePage() {
  const router = useRouter();
  const promoActive = isPromoActive();
  const [authLoaded, setAuthLoaded] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isAdminOrCreator, setIsAdminOrCreator] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showRedeem, setShowRedeem] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoError, setPromoError] = useState("");
  const [promoSubmitting, setPromoSubmitting] = useState(false);

  useEffect(() => {
    async function checkAccess() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login?redirect=/subscribe");
        return;
      }
      const [{ data: sub }, { data: prof }] = await Promise.all([
        supabase.from("subscriptions").select("status, plan_type").eq("user_id", user.id).eq("status", "active").maybeSingle(),
        supabase.from("profiles").select("role, is_creator").eq("id", user.id).maybeSingle(),
      ]);
      // Free-trial and promo subs shouldn't block the checkout flow — they need to
      // be able to convert to (or top up) a full plan before or after they expire.
      setIsSubscribed(!!sub && sub.plan_type !== "free_trial" && sub.plan_type !== "promo_5mo");
      setIsAdminOrCreator(!!(prof && (prof.role === "admin" || prof.is_creator)));
      setAuthLoaded(true);
    }
    checkAccess();
  }, [router]);

  async function handleSubscribe() {
    setCodeError("");
    setSubmitting(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ referralCode }),
    });
    const body = await res.json();
    if (!res.ok) {
      setCodeError(body.error || "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }
    window.location.href = body.url;
  }

  async function handleRedeemCode() {
    setPromoError("");
    setPromoSubmitting(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/redeem-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ code: promoCode }),
    });
    const body = await res.json();
    if (!res.ok) {
      setPromoError(body.error || "Something went wrong. Please try again.");
      setPromoSubmitting(false);
      return;
    }
    router.push('/account');
  }

  if (!authLoaded) {
    return (
      <main className="min-h-screen text-[#0F172A]">
        <NavBar activePath="/subscribe" />
        <div className="min-h-[60vh] flex items-center justify-center text-gray-400">Loading...</div>
      </main>
    );
  }

  if (isAdminOrCreator) {
    return (
      <main className="min-h-screen text-[#0F172A]">
        <NavBar activePath="/subscribe" />
        <div className="max-w-md mx-auto px-6 py-24 text-center">
          <div className="text-5xl mb-6">⭐</div>
          <h1 className="text-3xl font-bold mb-3">You already have full access</h1>
          <p className="text-gray-500 mb-8">Your account has complimentary access to all rankings and creator communities — no subscription needed.</p>
          <a href="/" className="inline-block bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-bold px-8 py-3 rounded-xl transition-all">
            Go to Rankings
          </a>
        </div>
      </main>
    );
  }

  if (isSubscribed) {
    return (
      <main className="min-h-screen text-[#0F172A]">
        <NavBar activePath="/subscribe" />
        <div className="max-w-md mx-auto px-6 py-24 text-center">
          <div className="text-5xl mb-6">✅</div>
          <h1 className="text-3xl font-bold mb-3">You're already subscribed</h1>
          <p className="text-gray-500 mb-8">You have an active subscription. Head to your account to manage it.</p>
          <a href="/account" className="inline-block bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-bold px-8 py-3 rounded-xl transition-all">
            Go to My Account
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen text-[#0F172A]">
      <NavBar activePath="/subscribe" />

      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold mb-2">Get Access</h1>
        <p className="text-gray-500 mb-10">One subscription unlocks all rankings plus every creator community on the platform.</p>

        {promoActive && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-5 py-3 mb-6 text-sm font-medium text-center">
            🎉 August Promo — $10 total for 5 months of access. Ends September 8th.
          </div>
        )}

        {/* Plan */}
        <div className="bg-white/70 backdrop-blur-md rounded-xl p-6 border-2 border-blue-600 shadow-lg mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold">Full Access</h2>
              <p className="text-gray-500 text-sm mt-1">All rankings · Consensus tab · Every creator community</p>
            </div>
            {promoActive ? (
              <div className="text-right">
                <span className="text-2xl font-bold text-blue-600">$10<span className="text-sm text-gray-400"> total</span></span>
                <p className="text-gray-400 text-xs">5 months, then $10/mo</p>
              </div>
            ) : (
              <span className="text-2xl font-bold text-blue-600">$10<span className="text-sm text-gray-400">/mo</span></span>
            )}
          </div>
          <ul className="text-gray-500 text-sm space-y-1 mb-6">
            <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Dynasty SF rankings</li>
            <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Dynasty 1QB rankings</li>
            <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Redraft PPR rankings</li>
            <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Redraft 0.5PPR rankings</li>
            <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Consensus rankings from all creators</li>
            <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Every creator community, including new ones as they join</li>
          </ul>

          <label className="block text-sm text-gray-500 mb-2">Creator code <span className="text-gray-400">(optional)</span></label>
          <input
            type="text"
            value={referralCode}
            onChange={(e) => { setReferralCode(e.target.value); setCodeError(""); }}
            placeholder="e.g. HUDDLE"
            className={"w-full bg-gray-50 border rounded-lg px-4 py-3 text-[#0F172A] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 " + (codeError ? "border-red-400" : "border-gray-200")}
          />
          {codeError ? (
            <p className="text-red-500 text-sm mt-2">{codeError}</p>
          ) : (
            <p className="text-gray-400 text-xs mt-2">Have a code from a creator you want to support? Enter it here — it doesn&apos;t change your price.</p>
          )}
        </div>

        {/* Total & CTA */}
        <div className="bg-white/70 backdrop-blur-md rounded-xl p-6 border border-white/80 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-500">{promoActive ? "Total (5 months)" : "Total per month"}</span>
            <span className="text-3xl font-bold text-blue-600">{promoActive ? "$10" : "$10/mo"}</span>
          </div>
          <button
            onClick={handleSubscribe}
            disabled={submitting}
            className="w-full bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-bold py-4 rounded-xl text-lg transition-all disabled:opacity-60"
          >
            {submitting ? "Redirecting..." : "Subscribe Now"}
          </button>
          <p className="text-center text-gray-400 text-xs mt-3">
            {promoActive ? "One-time payment — no recurring billing during the promo period." : "Cancel anytime. Billed monthly."}
          </p>
        </div>

        {/* Promo code redemption */}
        <div className="text-center mt-6">
          {!showRedeem ? (
            <button
              onClick={() => setShowRedeem(true)}
              className="text-gray-400 hover:text-gray-600 text-sm underline"
            >
              Have a free month code?
            </button>
          ) : (
            <div className="bg-white/70 backdrop-blur-md rounded-xl p-6 border border-white/80 shadow-lg text-left">
              <label className="block text-sm text-gray-500 mb-2">Promo code</label>
              <input
                type="text"
                value={promoCode}
                onChange={(e) => { setPromoCode(e.target.value); setPromoError(""); }}
                placeholder="Enter your code"
                className={"w-full bg-gray-50 border rounded-lg px-4 py-3 text-[#0F172A] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 " + (promoError ? "border-red-400" : "border-gray-200")}
              />
              {promoError && <p className="text-red-500 text-sm mt-2">{promoError}</p>}
              <button
                onClick={handleRedeemCode}
                disabled={promoSubmitting || !promoCode.trim()}
                className="w-full mt-4 bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-60"
              >
                {promoSubmitting ? "Redeeming..." : "Redeem Code"}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
