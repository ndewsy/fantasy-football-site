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
  const [isAdminOrCreator, setIsAdminOrCreator] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordIsError, setPasswordIsError] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      setUser(user);

      const [{ data: sub }, { data: prof }] = await Promise.all([
        supabase.from("subscriptions").select("*").eq("user_id", user.id).eq("status", "active").maybeSingle(),
        supabase.from("profiles").select("role, is_creator").eq("id", user.id).maybeSingle(),
      ]);
      setSubscription(sub || null);
      setIsAdminOrCreator(!!(prof && (prof.role === "admin" || prof.is_creator)));
      setLoading(false);
    }
    load();
  }, [router]);

  async function handleChangePassword() {
    if (!currentPassword) {
      setPasswordIsError(true);
      setPasswordMessage("Please enter your current password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordIsError(true);
      setPasswordMessage("New passwords don't match.");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordIsError(true);
      setPasswordMessage("New password must be at least 6 characters.");
      return;
    }
    setPasswordLoading(true);
    setPasswordMessage("");
    setPasswordIsError(false);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (signInError) {
      setPasswordIsError(true);
      setPasswordMessage("Current password is incorrect.");
      setPasswordLoading(false);
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordIsError(true);
      setPasswordMessage(error.message);
    } else {
      setPasswordIsError(false);
      setPasswordMessage("Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => {
        setShowChangePassword(false);
        setPasswordMessage("");
      }, 2000);
    }
    setPasswordLoading(false);
  }

  async function handleManageSubscription() {
    setPortalLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/portal", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not create portal session");
      }
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

          {!subscription && isAdminOrCreator ? (
            <div className="flex items-center justify-between">
              <span className="text-gray-500 text-sm">Access</span>
              <span className="text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-200 px-2.5 py-1 rounded-full">
                Creator Account — Full Access
              </span>
            </div>
          ) : !subscription ? (
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
        <div className="bg-white/70 backdrop-blur-md rounded-xl border border-white/80 shadow-lg p-6 mb-6">
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

        {/* Change Password */}
        <div className="bg-white/70 backdrop-blur-md rounded-xl border border-white/80 shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Password</h2>
            <button
              onClick={() => {
                setShowChangePassword(!showChangePassword);
                setPasswordMessage("");
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
              }}
              className="text-xs text-blue-500 hover:text-blue-600 font-medium"
            >
              {showChangePassword ? "Cancel" : "Change password"}
            </button>
          </div>

          {showChangePassword && (
            <div className="mt-4 flex flex-col gap-3">
              <div>
                <label className="block text-sm text-gray-500 mb-1.5">Current password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-[#0F172A] text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="••••••••"
                  autoFocus
                />
              </div>
              <div className="border-t border-gray-100 pt-3">
                <label className="block text-sm text-gray-500 mb-1.5">New password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-[#0F172A] text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1.5">Confirm new password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleChangePassword()}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-[#0F172A] text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="••••••••"
                />
              </div>
              {passwordMessage && (
                <div className={`p-3 rounded-lg text-sm ${passwordIsError ? "bg-red-50 border border-red-200 text-red-700" : "bg-green-50 border border-green-200 text-green-700"}`}>
                  {passwordMessage}
                </div>
              )}
              <button
                onClick={handleChangePassword}
                disabled={passwordLoading}
                className="w-full bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-semibold py-2.5 rounded-xl text-sm transition-all disabled:opacity-50"
              >
                {passwordLoading ? "Saving..." : "Save New Password"}
              </button>
            </div>
          )}

          {!showChangePassword && (
            <p className="text-gray-400 text-sm mt-2">••••••••</p>
          )}
        </div>

        {/* Log out */}
        <button
          onClick={async () => {
            const supabase = createClient();
            await supabase.auth.signOut();
            router.push("/");
          }}
          className="w-full bg-white/70 backdrop-blur-md hover:bg-red-50/80 border border-white/80 hover:border-red-200 shadow-lg text-red-500 hover:text-red-600 font-medium py-3 rounded-xl transition-colors text-sm"
        >
          Log Out
        </button>
      </div>
    </main>
  );
}
