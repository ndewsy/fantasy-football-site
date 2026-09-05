"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import NavBar from "@/app/components/NavBar";
import PageTitle from "@/app/components/PageTitle";
import PlayerHeadshot from "@/app/components/PlayerHeadshot";
import PillToggle from "@/app/components/PillToggle";
import { getCurrentWeekFromGames } from "@/lib/currentWeek";

const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);
const CATEGORIES = [
  { id: "priority", label: "Priority Adds" },
  { id: "drop", label: "Drop/Cut Candidates" },
  { id: "streamer", label: "Streamers" },
];

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
    <div className="bg-white/70 backdrop-blur-md rounded-xl border border-white/80 shadow-lg p-5">
      <h3 className="font-bold text-[#0F172A] mb-4">{creatorName}</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-400">Nothing posted yet.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {entries.map((e, i) => (
            <div key={e.id} className="flex items-center gap-2.5 py-2">
              <span className="text-xs text-gray-400 font-mono w-5 shrink-0 text-right">{i + 1}</span>
              <PlayerHeadshot espnId={e.players?.espn_id} sleeperId={e.players?.sleeper_id} name={e.players?.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#0F172A] truncate">{e.players?.name || `#${e.player_id}`}</p>
                <p className="text-xs text-gray-400">{e.players?.position} · {e.players?.team}</p>
              </div>
              <TermBadge term={e.term} />
              {e.faab_pct !== null && e.faab_pct !== undefined && (
                <span className="text-xs font-semibold text-[#0F172A] shrink-0">{Number(e.faab_pct).toFixed(1)}%</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WaiverWirePage() {
  const [loading, setLoading] = useState(true);
  const [isDashboardUser, setIsDashboardUser] = useState(false);
  const [week, setWeek] = useState(1);
  const [category, setCategory] = useState(CATEGORIES[0].id);
  const [creatorsById, setCreatorsById] = useState({});
  const [dataLoading, setDataLoading] = useState(true);
  const [creators, setCreators] = useState({});

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const [profileResult, creatorProfilesResult, gamesResult] = await Promise.all([
        user
          ? supabase.from("profiles").select("role, is_creator").eq("id", user.id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("profiles").select("creator_id, display_name").eq("is_creator", true).not("creator_id", "is", null),
        supabase.from("season_games").select("week, status, kickoff_at").order("kickoff_at", { ascending: true }),
      ]);

      setIsDashboardUser(!!(profileResult.data && (profileResult.data.role === "admin" || profileResult.data.is_creator)));
      setCreatorsById(Object.fromEntries((creatorProfilesResult.data || []).map((c) => [c.creator_id, c.display_name || c.creator_id])));
      setWeek(getCurrentWeekFromGames(gamesResult.data || []));
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (!isDashboardUser) return;
    setDataLoading(true);
    fetch(`/api/waiver-wire?week=${week}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCreators(d?.creators || {}))
      .catch(() => setCreators({}))
      .finally(() => setDataLoading(false));
  }, [week, isDashboardUser]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>;

  return (
    <main className="min-h-screen text-[#0F172A] lg:pl-56">
      <NavBar activePath="/waiver-wire" />

      <div className="max-w-4xl mx-auto px-6 py-12">
        <PageTitle title="Waiver Wire" subtitle="Beta" />
        <p className="text-gray-500 text-center mb-8 max-w-xl mx-auto">
          Priority adds, drop/cut candidates, and streamers by week — creators only while this is in beta.
        </p>

        {!isDashboardUser ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
            <p className="text-amber-600 font-semibold text-lg mb-1">🔒 Creators only</p>
            <p className="text-gray-500 text-sm">Waiver Wire is in beta and only visible to creators right now.</p>
          </div>
        ) : (
          <>
            <PillToggle options={CATEGORIES.map((c) => ({ id: c.id, label: c.label }))} value={category} onChange={setCategory} className="mb-5" />

            <div className="flex items-center justify-center gap-2 mb-8">
              <label className="text-xs font-semibold text-gray-500">Week:</label>
              <select
                value={week}
                onChange={(e) => setWeek(Number(e.target.value))}
                className="bg-white/60 backdrop-blur-sm border border-white/70 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {WEEKS.map((w) => (
                  <option key={w} value={w}>Week {w}</option>
                ))}
              </select>
            </div>

            {dataLoading ? (
              <p className="text-sm text-gray-400 text-center py-12">Loading...</p>
            ) : Object.keys(creators).length === 0 ? (
              <div className="bg-white/70 backdrop-blur-md rounded-xl border border-white/80 shadow-lg p-8 text-center">
                <p className="text-gray-400 text-sm">No waiver wire picks posted for Week {week} yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {Object.entries(creators).map(([creatorId, byCategory]) => (
                  <CreatorCategoryCard
                    key={creatorId}
                    creatorName={creatorsById[creatorId] || creatorId}
                    entries={byCategory[category] || []}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
