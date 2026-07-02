"use client";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase";

export default function SuccessPage() {
  useEffect(() => {
    async function saveSubscription() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const included = localStorage.getItem('included_creator') || '';
        const addOns = JSON.parse(localStorage.getItem('add_on_creators') || '[]');
        await supabase.from('subscriptions').upsert({
          user_id: user.id,
          status: 'active',
          included_creator: included,
          add_on_creators: addOns,
        });
        localStorage.removeItem('included_creator');
        localStorage.removeItem('add_on_creators');
      }
    }
    saveSubscription();
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-6">🎉</div>
        <h1 className="text-4xl font-bold mb-4 text-[#0F172A]">You're in!</h1>
        <p className="text-gray-500 mb-8">
          Your subscription is active. You now have access to all rankings and your chosen creator community.
        </p>
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
