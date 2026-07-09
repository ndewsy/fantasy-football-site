"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const supabase = createClient();

  async function handleSubmit() {
    setLoading(true);
    setMessage("");

    if (isSignup) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setMessage(error.message);
      else setMessage("Check your email to confirm your account!");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
      else window.location.href = "/";
    }
    setLoading(false);
  }

  async function handleForgot() {
    if (!email) {
      setMessage("Please enter your email address.");
      return;
    }
    setLoading(true);
    setMessage("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "https://www.fantasycollective.ca/account/reset-password",
    });
    if (error) {
      setMessage(error.message);
    } else {
      setResetSent(true);
    }
    setLoading(false);
  }

  if (showForgot) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <a href="/" className="text-2xl font-bold text-blue-600" style={{fontFamily: "'Fredoka One', cursive"}}>Fantasy Collective</a>
            <h2 className="text-3xl font-bold mt-4 text-[#0F172A]">Reset Password</h2>
            <p className="text-gray-500 mt-2">We'll send a reset link to your email.</p>
          </div>

          <div className="bg-white/70 backdrop-blur-md rounded-xl p-8 border border-white/80 shadow-lg">
            {resetSent ? (
              <div className="text-center py-4">
                <div className="text-4xl mb-4">📬</div>
                <p className="text-gray-700 font-medium mb-2">Check your inbox</p>
                <p className="text-gray-500 text-sm">
                  We sent a reset link to <strong>{email}</strong>. Click the link in the email to set a new password.
                </p>
                <button
                  onClick={() => { setShowForgot(false); setResetSent(false); setMessage(""); }}
                  className="mt-6 text-blue-600 hover:text-blue-700 font-medium text-sm"
                >
                  ← Back to sign in
                </button>
              </div>
            ) : (
              <>
                <div className="mb-6">
                  <label className="block text-sm text-gray-500 mb-2">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleForgot()}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-[#0F172A] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="you@example.com"
                    autoFocus
                  />
                </div>

                {message && (
                  <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                    {message}
                  </div>
                )}

                <button
                  onClick={handleForgot}
                  disabled={loading}
                  className="w-full bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
                >
                  {loading ? "Sending..." : "Send Reset Link"}
                </button>

                <p className="text-center text-gray-500 text-sm mt-4">
                  <button
                    onClick={() => { setShowForgot(false); setMessage(""); }}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    ← Back to sign in
                  </button>
                </p>
              </>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <a href="/" className="text-2xl font-bold text-blue-600" style={{fontFamily: "'Fredoka One', cursive"}}>Fantasy Collective</a>
          <h2 className="text-3xl font-bold mt-4 text-[#0F172A]">{isSignup ? "Create Account" : "Welcome Back"}</h2>
          <p className="text-gray-500 mt-2">{isSignup ? "Sign up to get started" : "Sign in to your account"}</p>
        </div>

        <div className="bg-white/70 backdrop-blur-md rounded-xl p-8 border border-white/80 shadow-lg">
          <div className="mb-4">
            <label className="block text-sm text-gray-500 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-[#0F172A] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="you@example.com"
            />
          </div>

          <div className="mb-1">
            <label className="block text-sm text-gray-500 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-[#0F172A] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>

          {!isSignup && (
            <div className="flex justify-end mb-5 mt-1.5">
              <button
                onClick={() => { setShowForgot(true); setMessage(""); }}
                className="text-xs text-blue-500 hover:text-blue-600"
              >
                Forgot password?
              </button>
            </div>
          )}

          {message && (
            <div className={`mb-4 p-3 rounded-lg text-sm ${message.includes("Check your email") ? "bg-blue-50 border border-blue-200 text-blue-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
              {message}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
          >
            {loading ? "Loading..." : isSignup ? "Create Account" : "Sign In"}
          </button>

          <p className="text-center text-gray-500 text-sm mt-4">
            {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              onClick={() => { setIsSignup(!isSignup); setMessage(""); }}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              {isSignup ? "Sign in" : "Sign up"}
            </button>
          </p>
        </div>
      </div>
    </main>
  );
}
