"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import NavBar from "@/app/components/NavBar";
import PageTitle from "@/app/components/PageTitle";
import PostCard from "@/app/components/PostCard";
import PillToggle from "@/app/components/PillToggle";
import { getViewMode } from "@/lib/viewMode";

const ALL_TAG = "all";
const ALL_CREATOR = "all";

export default function PostsPage() {
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState([]);
  const [creatorsById, setCreatorsById] = useState({});
  const [subscription, setSubscription] = useState(null);
  const [realIsDashboardUser, setRealIsDashboardUser] = useState(false);
  const [viewMode, setViewModeState] = useState("real");
  const [activeCreatorIds, setActiveCreatorIds] = useState([]);
  const [tagFilter, setTagFilter] = useState(ALL_TAG);
  const [creatorFilter, setCreatorFilter] = useState(ALL_CREATOR);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const [postsResult, creatorProfilesResult, subResult, ownProfileResult, activeCreatorsResult] = await Promise.all([
        supabase.from("posts").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("creator_id, display_name, logo_url").eq("is_creator", true).not("creator_id", "is", null),
        user
          ? supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle()
          : Promise.resolve({ data: null }),
        user
          ? supabase.from("profiles").select("role, is_creator").eq("id", user.id).maybeSingle()
          : Promise.resolve({ data: null }),
        fetch("/api/creators/active").then((r) => r.ok ? r.json() : { creators: [] }).catch(() => ({ creators: [] })),
      ]);

      setPosts(postsResult.data || []);
      setCreatorsById(Object.fromEntries((creatorProfilesResult.data || []).map((c) => [c.creator_id, c])));
      setSubscription(subResult.data);
      setRealIsDashboardUser(!!(ownProfileResult.data && (ownProfileResult.data.role === "admin" || ownProfileResult.data.is_creator)));
      setViewModeState(getViewMode());
      setActiveCreatorIds((activeCreatorsResult.creators || []).map((c) => c.creator_id));
      setLoading(false);
    }
    load();
  }, []);

  // Same staff-preview + per-creator access model as the individual creator
  // pages (app/creators/rookierager/page.js): a "flat_access" plan only
  // covers creators opted into that pool, but any other active subscription
  // covers every creator — so access has to be computed per post's own
  // creator_id, not once globally.
  const effectiveViewMode = realIsDashboardUser ? viewMode : "real";
  const isDashboardUser = effectiveViewMode === "real" ? realIsDashboardUser : false;
  function isSubscribedForCreator(creatorId) {
    if (effectiveViewMode === "subscriber") return true;
    if (effectiveViewMode === "free") return false;
    const isFlatAccessGranted = subscription?.plan_type === "flat_access"
      && subscription?.status === "active"
      && activeCreatorIds.includes(creatorId);
    return isDashboardUser
      || (!!subscription && subscription.plan_type !== "flat_access" && subscription.status === "active")
      || isFlatAccessGranted;
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>;

  const tags = [...new Set(posts.map((p) => p.tag).filter(Boolean))].sort();
  const tagOptions = [{ id: ALL_TAG, label: "All" }, ...tags.map((t) => ({ id: t, label: t }))];

  const filtered = posts.filter((p) => {
    if (tagFilter !== ALL_TAG && p.tag !== tagFilter) return false;
    if (creatorFilter !== ALL_CREATOR && p.creator_id !== creatorFilter) return false;
    return true;
  });

  return (
    <main className="min-h-screen text-ink lg:pl-56">
      <NavBar activePath="/posts" />

      <div className="max-w-6xl mx-auto px-6 py-12">
        <PageTitle title="Posts" />
        <p className="text-gray-500 text-center mb-8 max-w-xl mx-auto">
          The latest rankings, analysis, and tools from all of our creators.
        </p>

        <PillToggle options={tagOptions} value={tagFilter} onChange={setTagFilter} className="mb-4" />

        <div className="flex items-center justify-center gap-2 mb-8">
          <label className="text-xs font-semibold text-gray-500">Creator:</label>
          <select
            value={creatorFilter}
            onChange={(e) => setCreatorFilter(e.target.value)}
            className="bg-card/60 backdrop-blur-sm border border-card/70 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value={ALL_CREATOR}>All Creators</option>
            {Object.entries(creatorsById).map(([id, c]) => (
              <option key={id} value={id}>{c.display_name || id}</option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="bg-card/70 backdrop-blur-md rounded-xl border border-card/80 shadow-lg py-12 text-center">
            <p className="text-gray-500 font-medium mb-1">No posts yet</p>
            <p className="text-gray-400 text-sm">Check back soon for new content.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                isSubscribed={isSubscribedForCreator(post.creator_id)}
                creatorName={creatorsById[post.creator_id]?.display_name || post.creator_id}
                creatorLogoUrl={creatorsById[post.creator_id]?.logo_url}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
