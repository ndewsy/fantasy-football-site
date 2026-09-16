"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import NavBar from "@/app/components/NavBar";
import PageTitle from "@/app/components/PageTitle";
import PlayerHeadshot from "@/app/components/PlayerHeadshot";
import PillToggle from "@/app/components/PillToggle";
import PromoPrice from "@/app/components/PromoPrice";
import CreatorAvatar from "@/app/components/CreatorAvatar";
import PlayerCardModal from "@/app/components/PlayerCardModal";
import { getCurrentWeekFromGames } from "@/lib/currentWeek";
import { getViewMode } from "@/lib/viewMode";
import { isPromoActive } from "@/lib/promo";

// Same format/creator lists PlayerCardModal expects — duplicated from
// app/page.js (which owns the real tab-switching state these drive there);
// here the modal is always shown in its read-only consensus view, so no
// per-creator activeFormat/activeCreator state is needed to go with them.
const FORMATS = ["Redraft 1QB", "Redraft SF", "Dynasty 1QB", "Dynasty SF"];
const CREATORS = [
  { id: "rookierager", name: "RookieRager", short: "RookieRager" },
  { id: "ffhuddle", name: "FantasyFootballHuddle", short: "FFHuddle" },
];
const ACTIVE_CREATORS = CREATORS;

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
// Only Streamers splits into position tabs — Drop/Cut and Priority Adds are
// both flat lists.
const POSITIONAL_CATEGORIES = new Set(["streamer"]);
// Sleeper's own position color scheme — used both for the position tabs
// above and each row's position badge (most useful on Priority Adds now
// that it's a single list mixing every position together).
const POSITION_COLORS = {
  QB: { badge: "bg-red-100 text-red-700", active: "bg-red-500 text-white shadow-red-600/30" },
  RB: { badge: "bg-green-100 text-green-700", active: "bg-green-500 text-white shadow-green-600/30" },
  WR: { badge: "bg-blue-100 text-blue-700", active: "bg-blue-500 text-white shadow-blue-600/30" },
  TE: { badge: "bg-orange-100 text-orange-700", active: "bg-orange-500 text-white shadow-orange-600/30" },
  K: { badge: "bg-purple-100 text-purple-700", active: "bg-purple-500 text-white shadow-purple-600/30" },
  DST: { badge: "bg-[#8B5E34]/10 text-[#8B5E34]", active: "bg-[#8B5E34] text-white shadow-[#8B5E34]/30" },
};
const CREATOR_BADGE = {
  rookierager: { label: "RR", className: "bg-orange-100 text-orange-700" },
  ffhuddle: { label: "FFH", className: "bg-blue-100 text-blue-700" },
};

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

// A single waiver-wire pick — gray panel instead of a plain divider-only
// row, and clickable through to the player's full card.
function WaiverRow({ entry, index, onOpenPlayer }) {
  const p = entry.players;
  return (
    <div
      onClick={() => onOpenPlayer(entry)}
      className="flex items-center gap-2.5 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg cursor-pointer transition-colors"
    >
      <span className="text-xs text-gray-400 font-mono w-5 shrink-0 text-right">{index + 1}</span>
      <PlayerHeadshot espnId={p?.espn_id} sleeperId={p?.sleeper_id} name={p?.name} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink truncate">{p?.name || `#${entry.player_id}`}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {p?.position && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${POSITION_COLORS[p.position]?.badge || "bg-gray-100 text-gray-600"}`}>
              {p.position}
            </span>
          )}
          <span className="text-xs text-gray-400">{p?.team}</span>
        </div>
      </div>
      {p?.percent_rostered !== null && p?.percent_rostered !== undefined && (
        <span className="text-[11px] text-gray-400 shrink-0" title="% of ESPN leagues rostering this player">
          {Math.round(p.percent_rostered)}% rost.
        </span>
      )}
      <TermBadge term={entry.term} />
      {entry.faab_pct !== null && entry.faab_pct !== undefined && (
        <span className="text-xs font-semibold text-ink shrink-0">{Number(entry.faab_pct).toFixed(1)}%</span>
      )}
    </div>
  );
}

function CreatorCategoryCard({ creatorName, entries, onOpenPlayer }) {
  return (
    <div className="bg-card/70 backdrop-blur-md rounded-xl border border-card/80 shadow-lg p-5">
      <h3 className="font-bold text-ink mb-4">{creatorName}</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-400">Nothing posted yet.</p>
      ) : (
        <div className="space-y-1.5">
          {entries.map((e, i) => (
            <WaiverRow key={e.id} entry={e} index={i} onOpenPlayer={onOpenPlayer} />
          ))}
        </div>
      )}
    </div>
  );
}

// Full-width, unboxed layout matching Weekly Rankings — used when there's
// only one creator's picks to show, so it doesn't look stranded in a narrow
// centered card next to a lot of empty page.
function CreatorList({ creatorId, creatorName, logoUrl, entries, onOpenPlayer }) {
  const badge = CREATOR_BADGE[creatorId] || {};
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-4">
        <CreatorAvatar logoUrl={logoUrl} initials={badge.label || creatorName?.slice(0, 2).toUpperCase() || "?"} colorClass="bg-blue-600" size="sm" />
        <p className="font-bold text-ink text-sm">{creatorName}</p>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-400">Nothing posted yet.</p>
      ) : (
        <div className="space-y-1.5">
          {entries.map((e, i) => (
            <WaiverRow key={e.id} entry={e} index={i} onOpenPlayer={onOpenPlayer} />
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
  const [playerPool, setPlayerPool] = useState([]);
  const [riskRatings, setRiskRatings] = useState({}); // { [playerId]: { [creatorId]: rating } }
  const [rankingsCache, setRankingsCache] = useState({});
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerModalOpen, setPlayerModalOpen] = useState(false);

  // Backs the player-card modal (full pool for its Rankings-by-Format table,
  // risk ratings for its consensus display) — loaded in the background
  // rather than gating the page's own `loading` flag on it, since neither is
  // needed until a row is actually clicked.
  useEffect(() => {
    async function loadPool() {
      const supabase = createClient();
      const data = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data: batch } = await supabase
          .from("players")
          .select("id, name, position, team, sleeper_id, espn_id, height_inches, weight_lbs, age, percent_rostered")
          .order("id")
          .range(from, from + PAGE - 1);
        data.push(...(batch || []));
        if (!batch || batch.length < PAGE) break;
      }
      setPlayerPool(data.map((p) => ({ id: p.id, name: p.name, pos: p.position, team: p.team || "FA", sleeper_id: p.sleeper_id, espn_id: p.espn_id, height_inches: p.height_inches, weight_lbs: p.weight_lbs, age: p.age, percent_rostered: p.percent_rostered })));
    }
    loadPool();

    fetch("/api/players/risk-ratings")
      .then((r) => (r.ok ? r.json() : { ratings: [] }))
      .then(({ ratings }) => {
        const map = {};
        for (const r of ratings || []) {
          (map[r.player_id] ??= {})[r.creator_id] = r.risk_rating;
        }
        setRiskRatings(map);
      })
      .catch(() => {});
  }, []);

  // Constructs the same player shape playerPool entries use (PlayerCardModal
  // expects `.pos`, not `.position`) from a waiver-wire entry's joined
  // player row, and opens the modal in its read-only consensus view — this
  // page has no creator-tab concept of its own to key an editable view off.
  function openPlayerModal(entry) {
    const p = entry.players;
    setSelectedPlayer({
      id: entry.player_id,
      name: p?.name,
      pos: p?.position,
      team: p?.team || "FA",
      sleeper_id: p?.sleeper_id,
      espn_id: p?.espn_id,
      percent_rostered: p?.percent_rostered,
    });
    setPlayerModalOpen(true);
  }

  const creatorRatings = selectedPlayer
    ? Object.fromEntries(
        ACTIVE_CREATORS
          .map((c) => [c.id, riskRatings[selectedPlayer.id]?.[c.id]])
          .filter(([, v]) => v != null)
      )
    : {};
  const ratedValues = Object.values(creatorRatings);
  const displayedRisk = ratedValues.length > 0
    ? Math.round((ratedValues.reduce((a, b) => a + b, 0) / ratedValues.length) * 10) / 10
    : null;

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
        supabase.from("profiles").select("creator_id, display_name, logo_url").eq("is_creator", true).not("creator_id", "is", null),
        supabase.from("season_games").select("week, status, kickoff_at").order("kickoff_at", { ascending: true }),
      ]);

      setRealIsDashboardUser(!!(profileResult.data && (profileResult.data.role === "admin" || profileResult.data.is_creator)));
      setRawIsSubscribed(!!subResult.data);
      setViewModeState(getViewMode());
      setCreatorsById(Object.fromEntries((creatorProfilesResult.data || []).map((c) => [c.creator_id, { name: c.display_name || c.creator_id, logoUrl: c.logo_url }])));
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

      <div className="max-w-6xl mx-auto px-6 py-12">
        <PageTitle title="Waiver Wire" />
        <p className="text-gray-500 text-center mb-8 max-w-xl mx-auto">
          Priority adds, drop/cut candidates, and streamers by week from our creators.
        </p>

        <PillToggle options={CATEGORIES.map((c) => ({ id: c.id, label: c.label }))} value={category} onChange={setCategory} className="mb-5" />

        {POSITIONAL_CATEGORIES.has(category) && (
          <PillToggle
            options={POSITIONS}
            value={position}
            onChange={setPosition}
            className="mb-5"
            activeClassFor={(id) => POSITION_COLORS[id]?.active}
          />
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
            // A single creator's picks get Weekly Rankings' full-width list
            // treatment instead of a narrow boxed card — matches that page's
            // format rather than looking stranded next to empty space.
            Object.keys(creators).length === 1 ? (
              <>
                {Object.entries(creators).map(([creatorId, byCategory]) => (
                  <CreatorList
                    key={creatorId}
                    creatorId={creatorId}
                    creatorName={creatorsById[creatorId]?.name || creatorId}
                    logoUrl={creatorsById[creatorId]?.logoUrl}
                    entries={getEntries(byCategory)}
                    onOpenPlayer={openPlayerModal}
                  />
                ))}
              </>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {Object.entries(creators).map(([creatorId, byCategory]) => (
                  <CreatorCategoryCard
                    key={creatorId}
                    creatorName={creatorsById[creatorId]?.name || creatorId}
                    entries={getEntries(byCategory)}
                    onOpenPlayer={openPlayerModal}
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
                <Link
                  href="/subscribe"
                  className="bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-bold px-7 py-3 rounded-xl transition-all text-base"
                >
                  {promoActive ? <>Subscribe to unlock — <PromoPrice /></> : "Subscribe to unlock — $10/mo"}
                </Link>
              </div>
            </div>
          );
        })()}
      </div>

      {playerModalOpen && selectedPlayer && (
        <PlayerCardModal
          player={selectedPlayer}
          onClose={() => setPlayerModalOpen(false)}
          displayPosRanks={{}}
          weeklyCurrentNflWeek={week}
          activeFormat={FORMATS[0]}
          FORMATS={FORMATS}
          ACTIVE_CREATORS={ACTIVE_CREATORS}
          playerPool={playerPool}
          rankingsCache={rankingsCache}
          onCacheFormat={(fmt, data) => setRankingsCache((prev) => ({ ...prev, [fmt]: data }))}
          isConsensusTab={true}
          displayedRisk={displayedRisk}
          canEditRisk={false}
          creatorRatings={creatorRatings}
          riskSaveStatus={null}
          activeCreator="consensus"
          onUpdateRiskLocal={() => {}}
          onCommitRisk={() => {}}
          onClearRisk={() => {}}
        />
      )}
    </main>
  );
}
