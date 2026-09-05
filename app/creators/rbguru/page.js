"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import NavBar from "@/app/components/NavBar";

export default function RBGuruPage() {
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDashboardUser, setIsDashboardUser] = useState(false);
  const [activeCreatorIds, setActiveCreatorIds] = useState([]);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      const [subResult, postsResult, ownProfileResult, activeCreatorsResult] = await Promise.all([
        user
          ? supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("posts").select("*").eq("creator_id", "rbguru").order("created_at", { ascending: false }),
        user
          ? supabase.from("profiles").select("role, is_creator").eq("id", user.id).maybeSingle()
          : Promise.resolve({ data: null }),
        fetch("/api/creators/active").then((r) => r.ok ? r.json() : { creators: [] }).catch(() => ({ creators: [] })),
      ]);

      setSubscription(subResult.data);
      setPosts(postsResult.data || []);
      setIsDashboardUser(!!(ownProfileResult.data && (ownProfileResult.data.role === "admin" || ownProfileResult.data.is_creator)));
      setActiveCreatorIds((activeCreatorsResult.creators || []).map((c) => c.creator_id));
      supabase.from("events").insert({ event_type: "page_view", creator_id: "rbguru", user_id: user?.id ?? null }).then(() => {}).catch(() => {});
      setLoading(false);
    }
    load();
  }, []);

  const isFlatAccessGranted = subscription?.plan_type === "flat_access"
    && subscription?.status === "active"
    && activeCreatorIds.includes("rbguru");
  const isSubscribed = isDashboardUser
    || (!!subscription && subscription.plan_type !== "flat_access" && subscription.status === "active")
    || isFlatAccessGranted;

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>;

  return (
    <main className="min-h-screen text-ink lg:pl-56">
      <NavBar activePath="/creators/rbguru" />

      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-center gap-6 mb-12">
          <div className="w-20 h-20 rounded-full bg-gray-400 flex items-center justify-center text-white font-bold text-2xl">?</div>
          <div>
            <h1 className="text-3xl font-bold">Coming Soon</h1>
            <p className="text-gray-500">@tba</p>
            <p className="text-gray-400 text-sm mt-1">A new creator is joining the platform soon.</p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8 text-center">
          <p className="text-blue-700 font-semibold text-lg mb-1">🔜 Creator Coming Soon</p>
          <p className="text-gray-500 text-sm">This creator spot is opening up. Stay tuned.</p>
        </div>

        <h2 className="text-xl font-bold mb-4">Latest Content</h2>
        <div className="bg-card/70 backdrop-blur-md rounded-xl border border-card/80 shadow-lg py-12 text-center">
          <p className="text-gray-500 font-medium mb-1">No posts yet</p>
          <p className="text-gray-400 text-sm">Check back soon for new content.</p>
        </div>
      </div>
    </main>
  );
}
