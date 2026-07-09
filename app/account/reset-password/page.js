"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = createClient();
    let isReady = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        isReady = true;
        setReady(true);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        isReady = true;
        setReady(true);
      }
    });

    // If no recovery session after 10s, the link is invalid or expired
    const timer = setTimeout(() => {
      if (!isReady) setExpired(true);
    }, 10000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  async function handleUpdate() {
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
    } else {
      setDone(true);
      setTimeout(() => router.push("/account"), 2500);
    }
    setLoading(false);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <a href="/" className="text-2xl font-bold text-blue-600" style={{fontFamily: "'Fredoka One', cursive"}}>Fantasy Collective</a>
          <h2 className="text-3xl font-bold mt-4 text-[#0F172A]">Set New Password</h2>
          {!done && ready && (
            <p className="text-gray-500 mt-2">Choose a new password for your account.</p>
          )}
        </div>

        <div className="bg-white/70 backdrop-blur-md rounded-xl p-8 border border-white/80 shadow-lg">
          {done ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-4">✅</div>
              <p className="text-gray-700 font-medium mb-2">Password updated!</p>
              <p className="text-gray-500 text-sm">Redirecting to your account...</p>
            </div>
          ) : expired && !ready ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-4">⏱️</div>
              <p className="text-gray-700 font-medium mb-2">Link expired or invalid</p>
              <p className="text-gray-500 text-sm mb-6">
                This reset link may have expired. Request a new one from the login page.
              </p>
              <a href="/login" className="text-blue-600 hover:text-blue-700 font-medium text-sm">
                ← Back to sign in
              </a>
            </div>
          ) : !ready ? (
            <div className="text-center py-8 text-gray-400 text-sm">Verifying reset link...</div>
          ) : (
            <>
              <div className="mb-4">
                <label className="block text-sm text-gray-500 mb-2">New password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-[#0F172A] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="••••••••"
                  autoFocus
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm text-gray-500 mb-2">Confirm new password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleUpdate()}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-[#0F172A] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                onClick={handleUpdate}
                disabled={loading}
                className="w-full bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
              >
                {loading ? "Updating..." : "Update Password"}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
