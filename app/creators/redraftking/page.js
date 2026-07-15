"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import NavBar from "@/app/components/NavBar";

export default function RedraftKingPage() {
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [posts, setPosts] = useState([]);
  const [creatorProfile, setCreatorProfile] = useState(null);
  const [rankingsUpdatedAt, setRankingsUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDashboardUser, setIsDashboardUser] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      const [subResult, postsResult, profileResult, rankingsResult, ownProfileResult] = await Promise.all([
        user
          ? supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("posts").select("*").eq("creator_id", "redraftking").order("created_at", { ascending: false }),
        supabase.from("profiles").select("display_name, handle, bio, announcement").eq("creator_id", "redraftking").eq("is_creator", true).maybeSingle(),
        supabase.from("rankings").select("updated_at").eq("creator_id", "ffhuddle").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        user
          ? supabase.from("profiles").select("role, is_creator").eq("id", user.id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      setSubscription(subResult.data);
      setPosts(postsResult.data || []);
      setCreatorProfile(profileResult.data || null);
      setRankingsUpdatedAt(rankingsResult.data?.updated_at || null);
      setIsDashboardUser(!!(ownProfileResult.data && (ownProfileResult.data.role === "admin" || ownProfileResult.data.is_creator)));
      supabase.from("events").insert({ event_type: "page_view", creator_id: "ffhuddle", user_id: user?.id ?? null }).then(() => {}).catch(() => {});
      setLoading(false);
    }
    load();
  }, []);

  const isSubscribed = !!subscription || isDashboardUser;

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>;

  return (
    <main className="min-h-screen text-[#0F172A]">
      <NavBar activePath="/creators/redraftking" />

      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex flex-wrap items-center gap-4 mb-12">
          <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-2xl">FFH</div>
          <div>
            <h1 className="text-3xl font-bold">{creatorProfile?.display_name || "FantasyFootballHuddle"}</h1>
            <p className="text-gray-500">{creatorProfile?.handle || "@ffhuddle"}</p>
            <p className="text-gray-400 text-sm mt-1">980 members</p>
            {rankingsUpdatedAt && (
              <p className="text-gray-400 text-xs mt-1">
                Rankings last updated {new Date(rankingsUpdatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            )}
            {creatorProfile?.bio && <p className="text-gray-500 text-sm mt-2 max-w-sm">{creatorProfile.bio}</p>}
          </div>
          {!isSubscribed && (
            <div className="w-full sm:w-auto sm:ml-auto text-center bg-white/70 backdrop-blur-md rounded-xl p-4 border border-white/80 shadow-lg">
              <p className="text-gray-500 text-sm mb-2">Get access</p>
              <a href="/subscribe" className="bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-bold px-6 py-2 rounded-lg inline-block transition-all">Subscribe — $10/mo</a>
            </div>
          )}
        </div>

        {creatorProfile?.announcement && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
            <span className="text-lg leading-none mt-0.5">📌</span>
            <p className="text-amber-800 text-sm font-medium leading-relaxed">{creatorProfile.announcement}</p>
          </div>
        )}

        {isSubscribed && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-8">
            <p className="text-green-600 font-semibold">✅ You have access to this community</p>
          </div>
        )}

        {!isSubscribed && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8 text-center">
            <p className="text-amber-600 font-semibold text-lg mb-1">🔒 Community Content Locked</p>
            <p className="text-gray-500 text-sm">Subscribe to unlock all content below.</p>
          </div>
        )}

        <h2 className="text-xl font-bold mb-4">Latest Content</h2>

        {posts.length === 0 ? (
          <div className="bg-white/70 backdrop-blur-md rounded-xl border border-white/80 shadow-lg py-12 text-center">
            <p className="text-gray-500 font-medium mb-1">No posts yet</p>
            <p className="text-gray-400 text-sm">Check back soon for new content.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {posts.map((post) => {
              const dateStr = new Date(post.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
              return (
                <div key={post.id} className="bg-white/70 backdrop-blur-md rounded-xl p-5 border border-white/80 shadow-lg relative overflow-hidden">
                  {isSubscribed ? (
                    <>
                      <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded mb-2 inline-block font-medium">{post.tag}</span>
                      <h3 className="font-semibold mb-2">{post.title}</h3>
                      <p className="text-gray-500 text-sm">{post.content}</p>
                      <p className="text-gray-400 text-xs mt-2">{dateStr}</p>
                    </>
                  ) : (
                    <>
                      <div className="blur-sm pointer-events-none">
                        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded mb-2 inline-block font-medium">{post.tag}</span>
                        <h3 className="font-semibold mb-1">{post.title}</h3>
                        <p className="text-gray-400 text-xs">{dateStr}</p>
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-2xl">🔒</span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
