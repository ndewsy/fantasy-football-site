"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

// Waits for onAuthStateChange to fire with the initial session rather than
// reading the local cache immediately, which can be empty right after a redirect.
function waitForSession(supabase, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      sub.unsubscribe();
      reject(new Error('Timed out waiting for auth session'));
    }, timeoutMs);

    const { data: { subscription: sub } } = supabase.auth.onAuthStateChange((_event, session) => {
      clearTimeout(timer);
      sub.unsubscribe();
      resolve(session);
    });
  });
}

export default function SuccessPage() {
  const [status, setStatus] = useState("saving");

  useEffect(() => {
    async function verifyAndActivate() {
      const params = new URLSearchParams(window.location.search);
      const session_id = params.get('session_id');

      if (!session_id) {
        console.error('[success] No session_id in URL');
        setStatus("error");
        return;
      }

      const supabase = createClient();

      let session;
      try {
        session = await waitForSession(supabase);
      } catch (err) {
        console.error('[success] Timed out waiting for auth session:', err.message);
        setStatus("no-user");
        return;
      }

      if (!session?.access_token) {
        console.error('[success] No auth session after waiting');
        setStatus("no-user");
        return;
      }

      const res = await fetch('/api/verify-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ session_id }),
      });

      if (res.ok) {
        localStorage.removeItem('included_creator');
        localStorage.removeItem('add_on_creators');
        setStatus("saved");
      } else {
        const body = await res.json().catch(() => ({}));
        console.error('[success] verify-checkout failed:', body);
        setStatus("error");
      }
    }
    verifyAndActivate();
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-6">🎉</div>
        <h1 className="text-4xl font-bold mb-4 text-[#0F172A]">You're in!</h1>
        <p className="text-gray-500 mb-8">
          Your subscription is active. You now have access to all rankings and your chosen creator community.
        </p>
        {status === "error" && (
          <p className="text-red-500 mb-4 text-sm">There was an issue activating your subscription. Please contact support.</p>
        )}
        {status === "no-user" && (
          <p className="text-red-500 mb-4 text-sm">We couldn't confirm your login. Please refresh this page.</p>
        )}
        <div className="flex flex-col gap-3">
          <a href="/" className="bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-bold py-3 rounded-xl transition-all">
            View Rankings
          </a>
          <a href="/creators" className="bg-white/70 backdrop-blur-md hover:bg-white/90 text-gray-700 font-bold py-3 rounded-xl transition-all border border-white/80">
            Browse Creator Communities
          </a>
        </div>
      </div>
    </main>
  );
}
