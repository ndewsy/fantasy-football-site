"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import NavBar from "@/app/components/NavBar";
import PageTitle from "@/app/components/PageTitle";
import PlayerHeadshot from "@/app/components/PlayerHeadshot";
import PillToggle from "@/app/components/PillToggle";
import PromoPrice from "@/app/components/PromoPrice";
import { getCurrentWeekFromGames } from "@/lib/currentWeek";
import { getViewMode } from "@/lib/viewMode";
import { isPromoActive } from "@/lib/promo";

const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);
const CATEGORIES = [
  { id: "priority", label: "Priority Adds" },
  { id: "drop", label: "Drop/Cut Candidates" },
  { id: "streamer", label: "Streamers" },
];
// Drop/Cut stays one flat list; Priority Adds and Streamers split by position.
const POSITIONS = [
  { id: "QB", label: "QB" },
  { id: "FLEX", label: "FLEX" },
  { id: "TE", label: "TE" },
  { id: "K", label: "K" },
  { id: "DST", label: "DST" },
];
const POSITIONAL_CATEGORIES = new Set(["priority", "streamer"]);

function TermBadge({ term }) {
  if (!term) return null;
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
      term === "short" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
    }`}>
      {term}
    </span>
  );
}

function CreatorCategoryCard({ creatorName, entries }) {
  return (
    <div className="bg-card/70 backdrop-blur-md rounded-xl border border-card/80 shadow-lg p-5">
      <h3 className="font-bold text-ink mb-4">{creatorName}</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-400">Nothing posted yet.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {entries.map((e, i) => (
            <div key={e.id} className="flex items-center gap-2.5 py-2">
              <span className="text-xs text-gray-400 font-mono w-5 shrink-0 text-right">{i + 1}</span>
              <PlayerHeadshot espnId={e.players?.espn_id} sleeperId={e.players?.sleeper_id} name={e.players?.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink truncate">{e.players?.name || `#${e.player_id}`}</p>
                <p className="text-xs text-gray-400">{e.players?.position} · {e.players?.team}</p>
              </div>
              {e.players?.percent_rostered !== null && e.players?.percent_rostered !== undefined && (
                <span className="text-[11px] text-gray-400 shrink-0" title="% of ESPN leagues rostering this player">
                  {Math.round(e.players.percent_rostered)}% rost.
                </span>
              )}
              <TermBadge term={e.term} />
              {e.faab_pct !== null && e.faab_pct !== undefined && (
                <span className="text-xs font-semibold text-ink shrink-0">{Number(e.faab_pct).toFixed(1)}%</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WaiverWirePage() {
  const promoActive = isPromoActive();
  const [loading, setLoading] = useState(true);
  const [realIsDashboardUser, setRealIsDashboardUser] = useState(false);
  const [rawIsSubscribed, setRawIsSubscribed] = useState(false);
  const [viewMode, setViewModeState] = useState("real");
  const [week, setWeek] = useState(1);
  const [category, setCategory] = useState(CATEGORIES[0].id);
  const [position, setPosition] = useState(POSITIONS[0].id);
  const [creatorsById, setCreatorsById] = useState({});
  const [dataLoading, setDataLoading] = useState(true);
  const [creators, setCreators] = useState({});

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const [profileResult, subResult, creatorProfilesResult, gamesResult] = await Promise.all([
        user
          ? supabase.from("profiles").select("role, is_creator").eq("id", user.id).maybeSingle()
          : Promise.resolve({ data: null }),
        user
          ? supabase.from("subscriptions").select("status").eq("user_id", user.id).eq("status", "active").maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("profiles").select("creator_id, display_name").eq("is_creator", true).not("creator_id", "is", null),
        supabase.from("season_games").select("week, status, kickoff_at").order("kickoff_at", { ascending: true }),
      ]);

      setRealIsDashboardUser(!!(profileResult.data && (profileResult.data.role === "admin" || profileResult.data.is_creator)));
      setRawIsSubscribed(!!subResult.data);
      setViewModeState(getViewMode());
      setCreatorsById(Object.fromEntries((creatorProfilesResult.data || []).map((c) => [c.creator_id, c.display_name || c.creator_id])));
      setWeek(getCurrentWeekFromGames(gamesResult.data || []));
      setLoading(false);
    }
    load();
  }, []);

  // Simulated preview for staff (see lib/viewMode.js) — a non-staff user's
  // view_mode cookie is ignored since effectiveViewMode only reads it when
  // realIsDashboardUser (the server-verified profiles lookup) is true.
  const effectiveViewMode = realIsDashboardUser ? viewMode : "real";
  const isDashboardUser = effectiveViewMode === "real" ? realIsDashboardUser : false;
  const isSubscribed = effectiveViewMode === "subscriber" ? true : effectiveViewMode === "free" ? false : rawIsSubscribed;
  const hasFullAccess = isDashboardUser || isSubscribed;

  useEffect(() => {
    setDataLoading(true);
    fetch(`/api/waiver-wire?week=${week}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCreators(d?.creators || {}))
      .catch(() => setCreators({}))
      .finally(() => setDataLoading(false));
  }, [week]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>;

  return (
    <main className="min-h-screen text-ink lg:pl-56">
      <NavBar activePath="/waiver-wire" />

      <div className="max-w-4xl mx-auto px-6 py-12">
        <PageTitle title="Waiver Wire" />
        <p className="text-gray-500 text-center mb-8 max-w-xl mx-auto">
          Priority adds, drop/cut candidates, and streamers by week from our creators.
        </p>

        <PillToggle options={CATEGORIES.map((c) => ({ id: c.id, label: c.label }))} value={category} onChange={setCategory} className="mb-5" />

        {POSITIONAL_CATEGORIES.has(category) && (
          <PillToggle options={POSITIONS} value={position} onChange={setPosition} className="mb-5" />
        )}

        <div className="flex items-center justify-center gap-2 mb-8">
          <label className="text-xs font-semibold text-gray-500">Week:</label>
          <select
            value={week}
            onChange={(e) => setWeek(Number(e.target.value))}
            className="bg-card/60 backdrop-blur-sm border border-card/70 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {WEEKS.map((w) => (
              <option key={w} value={w}>Week {w}</option>
            ))}
          </select>
        </div>

        {(() => {
          const getEntries = (byCategory) => {
            const forCategory = byCategory[category];
            if (!forCategory) return [];
            return POSITIONAL_CATEGORIES.has(category) ? (forCategory[position] || []) : forCategory;
          };

          if (dataLoading) {
            return <p className="text-sm text-gray-400 text-center py-12">Loading...</p>;
          }
          if (Object.keys(creators).length === 0) {
            return (
              <div className="bg-card/70 backdrop-blur-md rounded-xl border border-card/80 shadow-lg p-8 text-center">
                <p className="text-gray-400 text-sm">No waiver wire picks posted for Week {week} yet.</p>
              </div>
            );
          }

          const cards = (
            // A single creator's card in a 2-col grid leaves an empty cell
            // next to it on wide screens — center it at a fixed width instead.
            Object.keys(creators).length === 1 ? (
              <div className="max-w-md mx-auto">
                {Object.entries(creators).map(([creatorId, byCategory]) => (
                  <CreatorCategoryCard
                    key={creatorId}
                    creatorName={creatorsById[creatorId] || creatorId}
                    entries={getEntries(byCategory)}
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {Object.entries(creators).map(([creatorId, byCategory]) => (
                  <CreatorCategoryCard
                    key={creatorId}
                    creatorName={creatorsById[creatorId] || creatorId}
                    entries={getEntries(byCategory)}
                  />
                ))}
              </div>
            )
          );

          if (hasFullAccess) return cards;

          // Real picks, blurred — matches the home page's free-preview
          // pattern rather than showing fake placeholder data.
          return (
            <div className="relative">
              <div className="blur-md select-none pointer-events-none">{cards}</div>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
                <p className="text-ink font-semibold text-base bg-card/90 backdrop-blur-md px-4 py-2 rounded-lg shadow-lg">
                  🔒 Subscribe to see this week&apos;s picks
                </p>
                <a
                  href="/subscribe"
                  className="bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-bold px-7 py-3 rounded-xl transition-all text-base"
                >
                  {promoActive ? <>Subscribe to unlock — <PromoPrice /></> : "Subscribe to unlock — $10/mo"}
                </a>
              </div>
            </div>
          );
        })()}
      </div>
    </main>
  );
}
