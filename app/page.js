"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import NavBar from "@/app/components/NavBar";
import PageTitle from "@/app/components/PageTitle";
import PillToggle from "@/app/components/PillToggle";
import PlayerHeadshot from "@/app/components/PlayerHeadshot";
import PromoPrice from "@/app/components/PromoPrice";
import { isPromoActive } from "@/lib/promo";
import { anton } from "@/lib/fonts";
import { riskColor } from "@/lib/riskColor";
import ConsensusMovementWidget from "@/app/components/ConsensusMovementWidget";
import CreatorAvatar from "@/app/components/CreatorAvatar";
import { teamColors } from "@/lib/teamColors";
import { DST_FORMAT, KICKER_FORMAT } from "@/lib/dstKickerFormats";
import { getViewMode } from "@/lib/viewMode";
import { getCurrentWeekFromGames } from "@/lib/currentWeek";

const FORMATS = ["Redraft 1QB", "Redraft SF", "Dynasty 1QB", "Dynasty SF"];
const FORMAT_TABS = ["Weekly Rankings", ...FORMATS, "DST/K"];
const WEEKLY_POSITIONS = [
  { id: "QB", label: "QB" },
  { id: "RB", label: "RB" },
  { id: "WR", label: "WR" },
  { id: "TE", label: "TE" },
  { id: "DST", label: "DST" },
  { id: "K", label: "K" },
];

const CREATORS = [
  { id: "rookierager", name: "RookieRager", short: "RookieRager" },
  { id: "ffhuddle", name: "FantasyFootballHuddle", short: "FFHuddle" },
  { id: "coming-soon-3", name: "Coming Soon", comingSoon: true },
  { id: "coming-soon-4", name: "Coming Soon", comingSoon: true },
];

const ACTIVE_CREATORS = CREATORS.filter(c => !c.comingSoon);

const WAIVER_CATEGORY_LABELS = { priority: "Priority Add", drop: "Drop/Cut", streamer: "Streamer" };

// Mobile-only compact badge for creator rank columns — desktop keeps the
// full "RookieRager"/"FFHuddle" header text via c.short.
const CREATOR_MOBILE_BADGE = {
  rookierager: { label: "RR", className: "bg-orange-100 text-orange-700" },
  ffhuddle: { label: "FFH", className: "bg-blue-100 text-blue-700" },
};

const posColors = {
  WR: "bg-blue-100 text-blue-700",
  RB: "bg-green-100 text-green-700",
  QB: "bg-red-100 text-red-700",
  TE: "bg-amber-100 text-amber-700",
  DST: "bg-purple-100 text-purple-700",
  K: "bg-teal-100 text-teal-700",
};

// Vivid variants for the player modal's dark banner, where posColors' light
// backgrounds would have poor contrast.
const posBannerColors = {
  WR: "bg-blue-400",
  RB: "bg-green-500",
  QB: "bg-red-500",
  TE: "bg-amber-500",
};

// Lightens (positive percent) or darkens (negative) a hex color.
function shadeColor(hex, percent) {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const r = Math.max(0, Math.min(255, (num >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amt));
  const b = Math.max(0, Math.min(255, (num & 0x0000ff) + amt));
  return `#${(0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1)}`;
}

// Picks readable black/white text for an arbitrary background color.
function contrastText(hex) {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#0F172A" : "#FFFFFF";
}

function modalBannerGradient(team) {
  const { primary } = teamColors(team);
  return `linear-gradient(to bottom, ${shadeColor(primary, 10)} 0%, ${primary} 50%, ${shadeColor(primary, -18)} 100%)`;
}

const FREE_ROWS = 12;
const DEFAULT_TIERS = [1, 13, 25, 37, 49, 61, 73, 85, 97, 109, 121, 151];

function formatUpdatedAt(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (diffDays === 0) return "Updated today";
  if (diffDays === 1) return "Updated yesterday";
  if (diffDays < 7) return `Updated ${diffDays} days ago`;
  return `Updated ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function getTierNumber(rank, tiers) {
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (rank >= tiers[i]) return i + 1;
  }
  return 1;
}

// Converts a player array from integer IDs (new format) or objects (legacy) to player objects.
function expandIds(arr, byId) {
  if (!arr?.length) return [];
  if (typeof arr[0] === "number") return arr.map(id => byId[id]).filter(Boolean);
  return arr;
}

function normalizeName(name) {
  return name.toLowerCase().replace(/\./g, ' ').trim().replace(/\s+/g, ' ');
}

// Mobile-only display abbreviation — never touches the underlying player data,
// just how the name renders in the narrow table row. "Jahmyr Gibbs" -> "J. Gibbs".
function abbreviateFirstName(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

// Mobile-only display abbreviation for format tab labels — desktop keeps the
// full "Redraft 1QB" etc. via a separate span.
function abbreviateFormat(fmt) {
  return fmt.replace("Redraft", "RD").replace("Dynasty", "DYN");
}

// Position-appropriate stat line for the "previous season" card section —
// no point showing pass attempts on a WR or targets on a QB.
function seasonStatLine(position, stats) {
  if (!stats) return [];
  if (position === "QB") {
    return [
      { label: "Comp/Att", value: `${stats.pass_cmp}/${stats.pass_att}` },
      { label: "Pass Yds", value: stats.pass_yd },
      { label: "Pass TD", value: stats.pass_td },
      { label: "INT", value: stats.pass_int },
      { label: "Rush Yds", value: stats.rush_yd },
      { label: "Rush TD", value: stats.rush_td },
    ];
  }
  if (position === "RB") {
    return [
      { label: "Rush Att", value: stats.rush_att },
      { label: "Rush Yds", value: stats.rush_yd },
      { label: "Rush TD", value: stats.rush_td },
      { label: "Rec", value: stats.rec },
      { label: "Targets", value: stats.rec_tgt },
      { label: "Rec Yds", value: stats.rec_yd },
      { label: "Rec TD", value: stats.rec_td },
    ];
  }
  // WR / TE
  const line = [
    { label: "Rec", value: stats.rec },
    { label: "Targets", value: stats.rec_tgt },
    { label: "Rec Yds", value: stats.rec_yd },
    { label: "Rec TD", value: stats.rec_td },
  ];
  if (stats.rush_att > 0) {
    line.push({ label: "Rush Yds", value: stats.rush_yd }, { label: "Rush TD", value: stats.rush_td });
  }
  return line;
}

function computeConsensus(formatData) {
  const creatorLists = Object.values(formatData);
  if (creatorLists.length === 0) return null;

  const playerMap = {};
  for (const players of creatorLists) {
    players.forEach((player, i) => {
      const key = normalizeName(player.name);
      if (!playerMap[key]) playerMap[key] = { ...player, totalRank: 0, count: 0 };
      playerMap[key].totalRank += i + 1;
      playerMap[key].count++;
    });
  }

  return Object.values(playerMap)
    .map(p => ({ ...p, avgRank: p.totalRank / p.count }))
    .sort((a, b) => a.avgRank - b.avgRank);
}

export default function Home() {
  const promoActive = isPromoActive();
  // Weekly Rankings is the front-page default now — its own render branch
  // sets activeCreator to "ffhuddle" on click (see handleFormatChange), so
  // the initial state needs to match that for the risk-rating integration
  // and page_view logging to be correct on a fresh, un-clicked page load too.
  const [activeFormat, setActiveFormat] = useState("Weekly Rankings");
  const [dstkSubTab, setDstkSubTab] = useState(DST_FORMAT);
  const effectiveFormat = activeFormat === "DST/K" ? dstkSubTab : activeFormat;
  const [activeCreator, setActiveCreator] = useState("ffhuddle");
  const [rankingsCache, setRankingsCache] = useState({});
  const [rankingsLoading, setRankingsLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [rawIsSubscribed, setRawIsSubscribed] = useState(false);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [playerPool, setPlayerPool] = useState([]);
  const [poolLoaded, setPoolLoaded] = useState(false);
  const [realIsDashboardUser, setRealIsDashboardUser] = useState(false);
  const [viewMode, setViewModeState] = useState("real");
  const [isAdmin, setIsAdmin] = useState(false);
  const [myCreatorId, setMyCreatorId] = useState(null);
  const [riskRatings, setRiskRatings] = useState({}); // { [playerId]: { [creatorId]: rating } }
  const [weeklyRankingsData, setWeeklyRankingsData] = useState({}); // { [creatorId]: { weeks: {...} } }
  const [weeklyWeek, setWeeklyWeek] = useState(null);
  const [weeklyPosition, setWeeklyPosition] = useState("QB");
  const [weeklyCreatorProfiles, setWeeklyCreatorProfiles] = useState({}); // { [creatorId]: { logo_url } }
  const [weeklySeasonGames, setWeeklySeasonGames] = useState([]);
  const [weeklyCurrentNflWeek, setWeeklyCurrentNflWeek] = useState(1);
  const [showCreatorColumns, setShowCreatorColumns] = useState(true);
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState("All");
  const [teamFilter, setTeamFilter] = useState("All");
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerModalOpen, setPlayerModalOpen] = useState(false);
  const [riskSaveStatus, setRiskSaveStatus] = useState(null); // { playerId, status: "saving" | "saved" | "error" }
  const riskSaveSeqRef = useRef(0);
  const [playerRankings, setPlayerRankings] = useState({});
  const [playerRankingsLoading, setPlayerRankingsLoading] = useState(false);
  const [seasonStats, setSeasonStats] = useState(null);
  const [seasonStatsLoading, setSeasonStatsLoading] = useState(false);
  const [waiverMentions, setWaiverMentions] = useState([]);
  const [waiverMentionsLoading, setWaiverMentionsLoading] = useState(false);
  const [tiersCache, setTiersCache] = useState({});
  const [updatedAtCache, setUpdatedAtCache] = useState({});
  const [lockedCache, setLockedCache] = useState({});
  const [breakRankCache, setBreakRankCache] = useState({});
  const [movementCache, setMovementCache] = useState({});
  const rankingsRef = useRef(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    function onScroll() { setShowScrollTop(window.scrollY > 400); }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    async function loadPool() {
      const supabase = createClient();
      // Supabase caps an unpaginated select at 1000 rows — the players table
      // crossed that threshold once DST/K rows were added, so this has to
      // page through in batches or the tail of the pool silently vanishes.
      const PAGE = 1000;
      const data = [];
      for (let from = 0; ; from += PAGE) {
        const { data: batch } = await supabase
          .from("players")
          .select("id, name, position, team, sleeper_id, espn_id, height_inches, weight_lbs, age, percent_rostered")
          .order("adp_rank", { nullsFirst: false })
          .order("id")
          .range(from, from + PAGE - 1);
        data.push(...(batch || []));
        if (!batch || batch.length < PAGE) break;
      }
      setPlayerPool(data.map(p => ({ id: p.id, name: p.name, pos: p.position, team: p.team || "FA", sleeper_id: p.sleeper_id, espn_id: p.espn_id, height_inches: p.height_inches, weight_lbs: p.weight_lbs, age: p.age, percent_rostered: p.percent_rostered })));
      setPoolLoaded(true);
    }
    loadPool();
  }, []);

  useEffect(() => {
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

  useEffect(() => {
    async function loadWeekly() {
      const supabase = createClient();
      const creatorIds = ACTIVE_CREATORS.map((c) => c.id);
      const [weeklyResults, gamesResult, profilesResult] = await Promise.all([
        Promise.all(creatorIds.map((id) =>
          fetch(`/api/weekly-rankings?creator_id=${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : { weeks: {} })).catch(() => ({ weeks: {} }))
        )),
        supabase.from("season_games").select("week, status, kickoff_at, home_team, away_team").order("kickoff_at", { ascending: true }),
        supabase.from("profiles").select("creator_id, logo_url").in("creator_id", creatorIds).eq("is_creator", true),
      ]);
      const dataByCreator = Object.fromEntries(creatorIds.map((id, i) => [id, weeklyResults[i]]));
      setWeeklyRankingsData(dataByCreator);
      setWeeklyCreatorProfiles(Object.fromEntries((profilesResult.data || []).map((p) => [p.creator_id, p])));
      setWeeklySeasonGames(gamesResult.data || []);

      // Default to the current week if the active creator (ffhuddle, on a
      // fresh page load) has already published it, otherwise fall back to
      // the most recent archived week available.
      const currentWeek = getCurrentWeekFromGames(gamesResult.data || []);
      setWeeklyCurrentNflWeek(currentWeek);
      const availableWeeks = Object.keys(dataByCreator[activeCreator]?.weeks || {}).map(Number).sort((a, b) => a - b);
      if (availableWeeks.length > 0) {
        const defaultWeek = availableWeeks.includes(currentWeek)
          ? currentWeek
          : availableWeeks.filter((w) => w <= currentWeek).pop() ?? availableWeeks[availableWeeks.length - 1];
        setWeeklyWeek(defaultWeek);
      }
    }
    loadWeekly();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function loadAuth() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        const [{ data: sub }, { data: prof }] = await Promise.all([
          supabase.from("subscriptions").select("status").eq("user_id", user.id).eq("status", "active").maybeSingle(),
          supabase.from("profiles").select("role, is_creator, creator_id").eq("id", user.id).maybeSingle(),
        ]);
        setRawIsSubscribed(!!sub);
        setRealIsDashboardUser(!!(prof && (prof.role === "admin" || prof.is_creator)));
        setIsAdmin(prof?.role === "admin");
        setMyCreatorId(prof?.creator_id || null);
        setViewModeState(getViewMode());
      }
      setAuthLoaded(true);
    }
    loadAuth();
  }, []);

  // Simulated preview for staff (see lib/viewMode.js) — a non-staff user's
  // view_mode cookie is ignored since effectiveViewMode only reads it when
  // realIsDashboardUser (the server-verified profiles lookup) is true.
  const effectiveViewMode = realIsDashboardUser ? viewMode : "real";
  const isDashboardUser = effectiveViewMode === "real" ? realIsDashboardUser : false;
  const isSubscribed = effectiveViewMode === "subscriber" ? true : effectiveViewMode === "free" ? false : rawIsSubscribed;

  // Fire page_view when a creator tab is selected
  useEffect(() => {
    if (activeCreator === "consensus") return;
    const supabase = createClient();
    supabase.from("events").insert({
      event_type: "page_view",
      creator_id: activeCreator,
      user_id: user?.id ?? null,
    }).then(() => {}).catch(() => {});
  }, [activeCreator]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Weekly Rankings has its own data source (see the weekly-rankings
    // effect below) — "Weekly Rankings" isn't a real season format, so
    // there's nothing for /api/rankings to fetch here.
    if (activeFormat === "Weekly Rankings") return;

    const cachedFormat = rankingsCache[effectiveFormat];

    if (activeCreator === "consensus") {
      // need all active creators — skip only if every one is already cached
      if (cachedFormat && ACTIVE_CREATORS.every(c => cachedFormat[c.id] !== undefined)) return;
    } else {
      // Don't skip for individual creators — break_rank can change from the dashboard
      // and the stale cache would hide it until the user hard-refreshes.
    }

    setRankingsLoading(true);
    async function fetchRankings() {
      try {
        if (activeCreator === "consensus") {
          const res = await fetch(`/api/rankings?format=${encodeURIComponent(effectiveFormat)}`);
          const { rankings } = await res.json();
          const formatMap = {};
          const updatedAtMap = {};
          const lockedMap = {};
          for (const row of (rankings || [])) {
            formatMap[row.creator_id] = row.players || [];
            if (row.updated_at) updatedAtMap[row.creator_id] = row.updated_at;
            lockedMap[row.creator_id] = row.locked || false;
          }
          setRankingsCache(prev => ({
            ...prev,
            [effectiveFormat]: { ...(prev[effectiveFormat] || {}), ...formatMap },
          }));
          setUpdatedAtCache(prev => ({
            ...prev,
            [effectiveFormat]: { ...(prev[effectiveFormat] || {}), ...updatedAtMap },
          }));
          setLockedCache(prev => ({
            ...prev,
            [effectiveFormat]: { ...(prev[effectiveFormat] || {}), ...lockedMap },
          }));
          fetch(`/api/rankings/movement?format=${encodeURIComponent(effectiveFormat)}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
              if (data?.movement) setMovementCache(prev => ({ ...prev, [effectiveFormat]: { ...(prev[effectiveFormat] || {}), consensus: data.movement } }));
            })
            .catch(() => {});
        } else {
          const res = await fetch(
            `/api/rankings?creator_id=${encodeURIComponent(activeCreator)}&format=${encodeURIComponent(effectiveFormat)}`
          );
          const { players, tiers, updatedAt, locked, break_rank } = await res.json();
          setRankingsCache(prev => ({
            ...prev,
            [effectiveFormat]: { ...(prev[effectiveFormat] || {}), [activeCreator]: players || [] },
          }));
          if (tiers && tiers.length > 0) {
            setTiersCache(prev => ({
              ...prev,
              [effectiveFormat]: { ...(prev[effectiveFormat] || {}), [activeCreator]: tiers },
            }));
          }
          if (updatedAt) {
            setUpdatedAtCache(prev => ({
              ...prev,
              [effectiveFormat]: { ...(prev[effectiveFormat] || {}), [activeCreator]: updatedAt },
            }));
          }
          setLockedCache(prev => ({
            ...prev,
            [effectiveFormat]: { ...(prev[effectiveFormat] || {}), [activeCreator]: locked || false },
          }));
          setBreakRankCache(prev => ({
            ...prev,
            [effectiveFormat]: { ...(prev[effectiveFormat] || {}), [activeCreator]: break_rank ?? null },
          }));
          fetch(`/api/rankings/movement?creator_id=${encodeURIComponent(activeCreator)}&format=${encodeURIComponent(effectiveFormat)}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
              if (data?.movement) setMovementCache(prev => ({ ...prev, [effectiveFormat]: { ...(prev[effectiveFormat] || {}), [activeCreator]: data.movement } }));
            })
            .catch(() => {});
        }
      } catch (err) {
        console.error("Failed to fetch rankings:", err);
      }
      setRankingsLoading(false);
    }
    fetchRankings();
  }, [effectiveFormat, activeCreator, activeFormat]);

  function handleFormatChange(format) {
    setActiveFormat(format);
    // Weekly Rankings has no Consensus concept — default to ffhuddle so the
    // existing per-creator risk-rating logic (canEditRisk, displayedRisk,
    // etc.) works correctly with zero special-casing for weekly-ranked players.
    setActiveCreator(format === "Weekly Rankings" ? "ffhuddle" : "consensus");
    if (format === "DST/K") setDstkSubTab(DST_FORMAT);
    if (format === "Weekly Rankings") setWeeklyPosition("QB");
  }

  // Switches which creator's weekly rankings are shown — reuses activeCreator
  // (same state season-rankings/risk-rating logic already keys off) so the
  // risk-rating integration stays correct with no extra plumbing.
  function handleWeeklyCreatorChange(creatorId) {
    setActiveCreator(creatorId);
    const availableWeeks = Object.keys(weeklyRankingsData[creatorId]?.weeks || {}).map(Number).sort((a, b) => a - b);
    if (availableWeeks.length === 0) { setWeeklyWeek(null); return; }
    const defaultWeek = availableWeeks.includes(weeklyCurrentNflWeek)
      ? weeklyCurrentNflWeek
      : availableWeeks.filter((w) => w <= weeklyCurrentNflWeek).pop() ?? availableWeeks[availableWeeks.length - 1];
    setWeeklyWeek(defaultWeek);
  }

  const formatData = rankingsCache[effectiveFormat];
  const rankingsFetched = formatData !== undefined;
  const stillLoading = rankingsLoading || !rankingsFetched || !poolLoaded || !authLoaded;

  let displayPlayers = null;
  let hasData = false;

  const lockedForFormat = lockedCache[effectiveFormat] || {};
  // Individual creator tab locked for this viewer (admins/creators bypass)
  const isCreatorLocked = activeCreator !== "consensus" && !isDashboardUser && !!lockedForFormat[activeCreator];

  // Risk rating: each creator has their own rating, shown only on their tab;
  // Consensus averages across whichever creators have rated the player.
  const isConsensusTab = activeCreator === "consensus";
  const creatorRatings = selectedPlayer
    ? Object.fromEntries(
        ACTIVE_CREATORS
          .map((c) => [c.id, riskRatings[selectedPlayer.id]?.[c.id]])
          .filter(([, v]) => v != null)
      )
    : {};
  const ratedValues = Object.values(creatorRatings);
  const consensusAvg = ratedValues.length > 0
    ? Math.round((ratedValues.reduce((a, b) => a + b, 0) / ratedValues.length) * 10) / 10
    : null;
  const displayedRisk = isConsensusTab
    ? consensusAvg
    : (selectedPlayer ? riskRatings[selectedPlayer.id]?.[activeCreator] ?? null : null);
  const canEditRisk = isDashboardUser && !isConsensusTab && (isAdmin || myCreatorId === activeCreator);

  const weeklyWeeks = Object.keys(weeklyRankingsData[activeCreator]?.weeks || {}).map(Number).sort((a, b) => a - b);
  const weeklyRows = weeklyWeek ? (weeklyRankingsData[activeCreator]?.weeks?.[String(weeklyWeek)]?.[weeklyPosition] || []) : [];
  const weeklyPoolById = Object.fromEntries(playerPool.map(p => [p.id, p]));
  // team -> { opponent, homeAway } for whichever week is selected — BYE if
  // a team has no game that week.
  const weeklyMatchups = Object.fromEntries(
    weeklySeasonGames
      .filter((g) => g.week === weeklyWeek)
      .flatMap((g) => [
        [g.home_team, { opponent: g.away_team, homeAway: "home" }],
        [g.away_team, { opponent: g.home_team, homeAway: "away" }],
      ])
  );

  // Expand integer ID arrays at render time — playerPool is guaranteed loaded here
  // (stillLoading includes !poolLoaded, so !stillLoading means pool is ready).
  const byId = !stillLoading ? Object.fromEntries(playerPool.map(p => [p.id, p])) : {};
  const expandedFormatData = !stillLoading && formatData
    ? Object.fromEntries(Object.entries(formatData).map(([cid, arr]) => [cid, expandIds(arr, byId)]))
    : {};

  if (!stillLoading) {
    if (activeCreator === "consensus") {
      // Exclude locked creators from consensus so WIP edits don't skew the average
      const unlockedFormatData = Object.fromEntries(
        Object.entries(expandedFormatData).filter(([cid]) => !lockedForFormat[cid])
      );
      const consensus = computeConsensus(unlockedFormatData);
      if (consensus && consensus.length > 0) {
        displayPlayers = consensus;
        hasData = true;
      } else if (playerPool.length > 0) {
        displayPlayers = playerPool;
        hasData = true;
      }
    } else {
      const creatorMeta = CREATORS.find(c => c.id === activeCreator);
      if (!creatorMeta?.comingSoon) {
        displayPlayers = expandedFormatData[activeCreator] ?? null;
        hasData = displayPlayers !== null;
      }
    }
  }

  useEffect(() => {
    document.body.style.overflow = playerModalOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [playerModalOpen]);

  // Each creator sets their own risk rating for a player, only editable from
  // their own tab (see canEditRisk); everyone else sees the read-only version
  // (gated in the JSX below). onChange (fires continuously while dragging)
  // only updates local state for instant visual feedback; the actual
  // autosave commits on release/blur so we don't fire a PATCH per pixel of
  // drag or risk two in-flight saves resolving out of order and clobbering a
  // newer value with a stale one.
  function updateRiskRatingLocal(playerId, creatorId, value) {
    setRiskRatings(prev => {
      const playerMap = { ...(prev[playerId] || {}) };
      if (value == null) delete playerMap[creatorId];
      else playerMap[creatorId] = value;
      return { ...prev, [playerId]: playerMap };
    });
  }

  async function commitRiskRating(playerId, creatorId, value) {
    const seq = ++riskSaveSeqRef.current;
    setRiskSaveStatus({ playerId, status: "saving" });
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/players/risk-ratings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ creator_id: creatorId, player_id: playerId, risk_rating: value }),
      });
      if (!res.ok) throw new Error("save failed");
      if (seq === riskSaveSeqRef.current) setRiskSaveStatus({ playerId, status: "saved" });
    } catch {
      if (seq === riskSaveSeqRef.current) setRiskSaveStatus({ playerId, status: "error" });
    }
  }

  function clearRiskRating(playerId, creatorId) {
    updateRiskRatingLocal(playerId, creatorId, null);
    commitRiskRating(playerId, creatorId, null);
  }

  async function openPlayerModal(player) {
    if (activeCreator !== "consensus") {
      const supabase = createClient();
      supabase.from("events").insert({
        event_type: "player_click",
        creator_id: activeCreator,
        player_id: player.name,
        user_id: user?.id ?? null,
      }).then(() => {}).catch(() => {});
    }
    setSelectedPlayer(player);
    setPlayerModalOpen(true);
    setPlayerRankingsLoading(true);
    setPlayerRankings({});
    setSeasonStatsLoading(true);
    setSeasonStats(null);
    fetch(`/api/player-stats?playerId=${player.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSeasonStats(d?.seasonStats || null))
      .catch(() => setSeasonStats(null))
      .finally(() => setSeasonStatsLoading(false));

    setWaiverMentionsLoading(true);
    setWaiverMentions([]);
    fetch(`/api/waiver-wire?player_id=${player.id}&week=${weeklyCurrentNflWeek}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setWaiverMentions(d?.entries || []))
      .catch(() => setWaiverMentions([]))
      .finally(() => setWaiverMentionsLoading(false));

    const rankingsData = {};
    const modalById = Object.fromEntries(playerPool.map(p => [p.id, p]));
    await Promise.all(FORMATS.map(async (fmt) => {
      let rawFormatData = rankingsCache[fmt];
      if (!rawFormatData) {
        try {
          const res = await fetch(`/api/rankings?format=${encodeURIComponent(fmt)}`);
          const { rankings } = await res.json();
          const fmtMap = {};
          for (const row of (rankings || [])) fmtMap[row.creator_id] = row.players || [];
          rawFormatData = fmtMap;
          setRankingsCache(prev => ({ ...prev, [fmt]: fmtMap }));
        } catch {
          rawFormatData = {};
        }
      }
      const expandedFmt = Object.fromEntries(
        Object.entries(rawFormatData).map(([cid, arr]) => [cid, expandIds(arr, modalById)])
      );
      const consensus = computeConsensus(expandedFmt);
      const pKey = normalizeName(player.name);
      const cIdx = consensus ? consensus.findIndex(p => normalizeName(p.name) === pKey) : -1;
      const rrIdx = (expandedFmt["rookierager"] || []).findIndex(p => normalizeName(p.name) === pKey);
      const ffIdx = (expandedFmt["ffhuddle"] || []).findIndex(p => normalizeName(p.name) === pKey);
      rankingsData[fmt] = {
        consensus: cIdx >= 0 ? cIdx + 1 : null,
        rookierager: rrIdx >= 0 ? rrIdx + 1 : null,
        ffhuddle: ffIdx >= 0 ? ffIdx + 1 : null,
      };
    }));

    setPlayerRankings(rankingsData);
    setPlayerRankingsLoading(false);
  }

  function scrollToRankings() {
    rankingsRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  const unlocked = authLoaded && !!user && (isSubscribed || isDashboardUser);

  const teamOptions = displayPlayers
    ? ["All", ...Array.from(new Set(displayPlayers.map(p => p.team).filter(Boolean))).sort()]
    : ["All"];

  // On the DST/K tab, the DST/Kickers sub-tab IS the position filter — the
  // QB/RB/WR/TE pill row is hidden there (see JSX below).
  // dstkSubTab holds the *format* string ("DST"/"Kickers"), but rows are
  // filtered by *position code* — "DST" happens to match both, "Kickers"
  // does not (kickers are position "K"), so it needs translating here.
  const effectivePosFilter = activeFormat === "DST/K" ? (dstkSubTab === KICKER_FORMAT ? "K" : dstkSubTab) : posFilter;

  let filteredPlayers = displayPlayers;
  if (filteredPlayers && search.trim()) {
    filteredPlayers = filteredPlayers.filter(p => p.name.toLowerCase().includes(search.toLowerCase().trim()));
  }
  if (filteredPlayers && effectivePosFilter !== "All") {
    filteredPlayers = filteredPlayers.filter(p => p.pos === effectivePosFilter);
  }
  if (filteredPlayers && teamFilter !== "All") {
    filteredPlayers = filteredPlayers.filter(p => p.team === teamFilter);
  }

  const lockedCount = filteredPlayers ? Math.max(0, filteredPlayers.length - FREE_ROWS) : 0;
  const activeTiers = activeCreator === "consensus"
    ? DEFAULT_TIERS
    : (tiersCache[effectiveFormat]?.[activeCreator] || DEFAULT_TIERS);
  const noFilters = !search.trim() && effectivePosFilter === "All" && teamFilter === "All";

  const displayPosRanks = {};
  if (displayPlayers) {
    const posCount = {};
    for (const player of displayPlayers) {
      posCount[player.pos] = (posCount[player.pos] || 0) + 1;
      displayPosRanks[player.name] = `${player.pos}${posCount[player.pos]}`;
    }
  }

  // Break rank only applies on individual creator tabs (not consensus)
  const breakRankForCreator = activeCreator !== "consensus"
    ? (breakRankCache[effectiveFormat]?.[activeCreator] ?? null)
    : null;

  // Map player name → 1-indexed position in the full unfiltered displayPlayers list
  const displayRankByName = {};
  if (displayPlayers) {
    displayPlayers.forEach((p, i) => { displayRankByName[p.name] = i + 1; });
  }

  const creatorPosRanks = {};
  if (showCreatorColumns && activeCreator === "consensus" && !stillLoading) {
    for (const creator of ACTIVE_CREATORS) {
      const list = expandedFormatData[creator.id];
      if (list) {
        const posCount = {};
        creatorPosRanks[creator.id] = {};
        for (const player of list) {
          posCount[player.pos] = (posCount[player.pos] || 0) + 1;
          creatorPosRanks[creator.id][normalizeName(player.name)] = `${player.pos}${posCount[player.pos]}`;
        }
      }
    }
  }

  return (
    <main className="min-h-screen text-ink lg:pl-56">
      <NavBar activePath="/" />

      {/* Landing page — non-subscribers only */}
      {!isSubscribed && !isDashboardUser && (
        <div>
          {/* Hero */}
          <div className="text-center py-24 px-6">
            <div className="max-w-3xl mx-auto">
              <span className="inline-block bg-blue-50 text-blue-700 text-sm font-semibold px-4 py-1.5 rounded-full mb-6 border border-blue-100">
                Rankings updated weekly all season
              </span>
              <h2 className="text-3xl sm:text-5xl md:text-6xl font-bold mb-6 text-ink leading-tight">
                Expert Fantasy Football Rankings from Top Creators
              </h2>
              <p className="text-gray-500 text-lg sm:text-xl mb-10 max-w-2xl mx-auto leading-relaxed">
                Get consensus rankings and expert picks from the best fantasy football creators. One subscription, all formats, all season long.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <a href="/subscribe" className="w-full sm:w-auto text-center bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-bold px-8 py-4 rounded-xl text-lg transition-all">
                  {promoActive ? <>Get Access — <PromoPrice /></> : "Get Access — $10/mo"}
                </a>
                <button
                  onClick={scrollToRankings}
                  className="w-full sm:w-auto bg-card/70 backdrop-blur-sm border border-card/80 text-ink font-semibold px-8 py-4 rounded-xl text-lg hover:bg-card/90 transition-all"
                >
                  See Rankings ↓
                </button>
              </div>
            </div>
          </div>

          {/* Bridge to rankings */}
          <div className="max-w-5xl mx-auto px-6 pb-4 text-center">
            <h3 className="text-2xl font-bold mb-1 text-ink">Preview the Rankings</h3>
            <p className="text-gray-500 text-sm">First 12 players are free. Subscribe to unlock the full list.</p>
          </div>
        </div>
      )}

      {/* Subscriber header — shown instead of the full landing */}
      {authLoaded && (isSubscribed || isDashboardUser) && (
        <div className="w-full px-3 sm:px-6 lg:px-8 pt-10 pb-2">
          <h2 className={`${anton.className} text-4xl uppercase tracking-tight text-ink`}>Rankings</h2>
          <p className="text-gray-500 mt-1">Expert consensus rankings across all formats.</p>
        </div>
      )}

      {/* Rankings Section */}
      <div className="w-full px-3 sm:px-6 lg:px-8 pt-6 pb-20 flex flex-col lg:flex-row gap-6 items-start">

        <div ref={rankingsRef} className="w-full flex-1 min-w-0 order-1">

        {/* Format tabs */}
        <div className="flex flex-wrap gap-1 mb-5 lg:flex-nowrap lg:gap-2 lg:overflow-x-auto lg:pb-1">
          {FORMAT_TABS.map(fmt => (
            <button
              key={fmt}
              onClick={() => handleFormatChange(fmt)}
              className={`flex-1 lg:flex-none text-center px-2 py-2.5 text-xs lg:px-4 lg:py-2 lg:text-sm rounded-lg font-medium transition-colors lg:shrink-0 ${
                activeFormat === fmt
                  ? "bg-gradient-to-br from-[#2563EB] to-[#1E40AF] text-white"
                  : "bg-card/60 backdrop-blur-sm text-gray-600 hover:bg-card/80 border border-card/70"
              }`}
            >
              <span className="lg:hidden">{fmt === "DST/K" ? fmt : fmt === "Weekly Rankings" ? "Weekly" : abbreviateFormat(fmt)}</span>
              <span className="hidden lg:inline">{fmt}</span>
            </button>
          ))}
        </div>

        {/* DST vs Kickers sub-tab */}
        {activeFormat === "DST/K" && (
          <PillToggle
            options={[{ id: DST_FORMAT, label: "DST" }, { id: KICKER_FORMAT, label: "Kickers" }]}
            value={dstkSubTab}
            onChange={setDstkSubTab}
            className="mb-5"
          />
        )}

        {/* Everything below is the normal season-rankings view (creator tabs,
            filters, table) — Weekly Rankings has its own simpler render branch,
            since it has no tiers/consensus/multi-creator-comparison concepts. */}
        {activeFormat !== "Weekly Rankings" && (
        <>
        {/* Creator tabs + toggle */}
        {(() => {
          const creatorTabItems = [{ id: "consensus", name: "Consensus" }, ...CREATORS].map(creator => {
            let dateLabel = null;
            if (!creator.comingSoon) {
              if (creator.id === "consensus") {
                const formatTimestamps = Object.values(updatedAtCache[effectiveFormat] || {}).filter(Boolean);
                const latest = formatTimestamps.sort().reverse()[0];
                dateLabel = formatUpdatedAt(latest);
              } else {
                dateLabel = formatUpdatedAt(updatedAtCache[effectiveFormat]?.[creator.id]);
              }
            }
            return { ...creator, dateLabel };
          });

          return (
            <div className="flex items-center gap-2 mb-6 border-b border-gray-200">
              {/* Mobile: dropdown, defaults to Consensus */}
              <div className="lg:hidden flex-1 min-w-0 pb-2">
                <select
                  value={activeCreator}
                  onChange={e => setActiveCreator(e.target.value)}
                  className="w-full bg-card/60 backdrop-blur-sm border border-card/70 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {creatorTabItems.map(creator => (
                    <option key={creator.id} value={creator.id} disabled={creator.comingSoon}>
                      {creator.name}{creator.comingSoon ? " (Coming Soon)" : creator.dateLabel ? ` — ${creator.dateLabel}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Desktop: tab row, unchanged */}
              <div className="hidden lg:block flex-1 min-w-0 lg:overflow-x-auto lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden">
                <div className="flex flex-wrap lg:flex-nowrap">
                  {creatorTabItems.map(creator => (
                    <button
                      key={creator.id}
                      onClick={() => !creator.comingSoon && setActiveCreator(creator.id)}
                      disabled={creator.comingSoon}
                      className={`px-3 py-1.5 text-xs lg:px-4 lg:py-2 lg:text-sm font-medium transition-colors border-b-2 -mb-px shrink-0 text-left ${
                        creator.comingSoon
                          ? "border-transparent text-gray-300 cursor-not-allowed italic"
                          : activeCreator === creator.id
                            ? "border-blue-600 text-blue-600"
                            : "border-transparent text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      <span className="block leading-5">{creator.name}</span>
                      {creator.dateLabel && (
                        <span className={`block text-[10px] lg:text-xs font-normal leading-4 mt-0.5 ${
                          activeCreator === creator.id ? "text-blue-400" : "text-gray-400"
                        }`}>
                          {creator.dateLabel}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              {activeCreator === "consensus" && !stillLoading && hasData && (
                <button
                  onClick={() => setShowCreatorColumns(prev => !prev)}
                  className={`hidden sm:block -mb-px shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    showCreatorColumns
                      ? "bg-gradient-to-br from-[#2563EB] to-[#1E40AF] text-white"
                      : "bg-card/60 backdrop-blur-sm text-gray-600 border border-card/70 hover:bg-card/80"
                  }`}
                >
                  {showCreatorColumns ? "Hide Creator Rankings" : "Show Creator Rankings"}
                </button>
              )}
            </div>
          );
        })()}

        {/* Position filters + team filter + search */}
        {!stillLoading && hasData && (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {activeFormat !== "DST/K" && ["All", "QB", "RB", "WR", "TE"].map(pos => (
                <button
                  key={pos}
                  onClick={() => setPosFilter(pos)}
                  className={`px-2.5 py-1 text-xs lg:px-3 lg:py-1.5 lg:text-sm rounded-lg font-medium transition-colors shrink-0 ${
                    posFilter === pos
                      ? "bg-blue-600 text-white"
                      : "bg-card/60 backdrop-blur-sm text-gray-600 border border-card/70 hover:bg-card/80"
                  }`}
                >
                  {pos}
                </button>
              ))}
              <select
                value={teamFilter}
                onChange={e => setTeamFilter(e.target.value)}
                className={`px-2.5 py-1 text-xs lg:px-3 lg:py-1.5 lg:text-sm rounded-lg font-medium transition-colors border cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                  teamFilter !== "All"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-card/60 backdrop-blur-sm text-gray-600 border-card/70 hover:bg-card/80"
                }`}
              >
                {teamOptions.map(t => (
                  <option key={t} value={t}>{t === "All" ? "All Teams" : t}</option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search players..."
                className="w-full bg-card/60 backdrop-blur-sm border border-card/70 rounded-xl px-4 py-2.5 text-ink placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </>
        )}

        {/* Table area */}
        {stillLoading ? (
          <div className="bg-card/70 backdrop-blur-md rounded-xl border border-card/80 shadow-lg py-16 text-center text-gray-400">
            Loading...
          </div>
        ) : CREATORS.find(c => c.id === activeCreator)?.comingSoon ? (
          <div className="bg-card/70 backdrop-blur-md rounded-xl border border-card/80 shadow-lg py-16 text-center">
            <p className="text-gray-500 font-medium mb-1">Creator coming soon</p>
            <p className="text-gray-400 text-sm">This creator spot is opening up. Stay tuned.</p>
          </div>
        ) : isCreatorLocked ? (
          <div className="bg-card/70 backdrop-blur-md rounded-xl border border-amber-200 shadow-lg py-16 text-center px-6">
            <p className="text-2xl mb-3">🔄</p>
            <p className="text-ink font-semibold mb-1">Rankings in progress</p>
            <p className="text-gray-500 text-sm">This creator is currently updating their {effectiveFormat} rankings. Check back soon.</p>
          </div>
        ) : !hasData ? (
          <div className="bg-card/70 backdrop-blur-md rounded-xl border border-card/80 shadow-lg py-16 text-center">
            <p className="text-gray-500 font-medium mb-1">Rankings coming soon</p>
            <p className="text-gray-400 text-sm">
              {activeCreator === "consensus"
                ? "No creators have published rankings for this format yet."
                : `${CREATORS.find(c => c.id === activeCreator)?.name} hasn't published ${effectiveFormat} rankings yet.`}
            </p>
          </div>
        ) : filteredPlayers && filteredPlayers.length === 0 ? (
          <div className="bg-card/70 backdrop-blur-md rounded-xl border border-card/80 shadow-lg py-16 text-center">
            <p className="text-gray-500 font-medium mb-1">No players match your filters</p>
            <button
              onClick={() => { setSearch(""); setPosFilter("All"); setTeamFilter("All"); }}
              className="text-blue-600 text-sm hover:text-blue-700 mt-2"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="relative">
            <div className="bg-card/60 backdrop-blur-md rounded-xl overflow-hidden border border-card/70 shadow-lg">
              <table className="w-full">
                <thead className="bg-card/40 text-gray-500 text-xs lg:text-sm">
                  <tr>
                    <th className="text-left px-2 py-2 lg:px-6 lg:py-3 w-8 lg:w-16">Rank</th>
                    <th className="text-left px-2 py-2 lg:px-6 lg:py-3 w-full lg:w-auto">Player</th>
                    <th className="text-left px-1.5 py-2 lg:px-6 lg:py-3">
                      <span className="lg:hidden">Pos</span>
                      <span className="hidden lg:inline">Position</span>
                    </th>
                    <th className="hidden sm:table-cell text-left px-6 py-3">Team</th>
                    {activeCreator === "consensus" && ACTIVE_CREATORS.map(c => (
                      <th key={c.id} className={`text-left px-1 py-2 lg:px-6 lg:py-3 whitespace-nowrap text-[10px] lg:text-sm ${showCreatorColumns ? "" : "lg:hidden"}`}>
                        <span className="lg:hidden">
                          {CREATOR_MOBILE_BADGE[c.id] ? (
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${CREATOR_MOBILE_BADGE[c.id].className}`}>
                              {CREATOR_MOBILE_BADGE[c.id].label}
                            </span>
                          ) : c.short}
                        </span>
                        <span className="hidden lg:inline">{c.short}</span>
                      </th>
                    ))}
                  </tr>
                </thead>

                {/* Rows 1–12: always visible */}
                <tbody>
                  {filteredPlayers.slice(0, FREE_ROWS).map((player, i) => {
                    const rank = i + 1;
                    const tierNum = getTierNumber(rank, activeTiers);
                    const prevTierNum = i > 0 ? getTierNumber(rank - 1, activeTiers) : tierNum;
                    const showDivider = noFilters && (i === 0 || tierNum !== prevTierNum);
                    return (
                      <Fragment key={player.name}>
                        {showDivider && (
                          <tr className="select-none pointer-events-none">
                            <td colSpan={999} className="py-1 px-2 lg:py-1.5 lg:px-6">
                              <div className="w-full flex items-center gap-3">
                                <div className="flex-1 h-px bg-blue-200" />
                                <span className="text-xs font-semibold text-blue-600 tracking-wider uppercase">Tier {tierNum}</span>
                                <div className="flex-1 h-px bg-blue-200" />
                              </div>
                            </td>
                          </tr>
                        )}
                        <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="px-2 py-1.5 lg:px-6 lg:py-4 text-gray-400 font-mono text-[10px] lg:text-sm">{rank}{(() => { const m = movementCache[effectiveFormat]?.[activeCreator]?.[player.name]; if (!m) return null; return <span className={`ml-1.5 text-xs font-semibold ${m > 0 ? "text-green-600" : "text-red-500"}`}>{m > 0 ? "▲" : "▼"}{Math.abs(m)}</span>; })()}</td>
                          <td className="px-2 py-1.5 lg:px-6 lg:py-4 font-medium">
                            <span onClick={() => openPlayerModal(player)} className="cursor-pointer hover:text-blue-600 transition-colors flex items-center gap-1.5 lg:gap-2.5 text-xs lg:text-base min-w-0">
                              <PlayerHeadshot espnId={player.pos === "DST" ? null : player.espn_id} sleeperId={player.pos === "DST" ? null : player.sleeper_id} name={player.name} size="tableRow" shape="square" teamColor={teamColors(player.team).primary} label={player.pos === "DST" ? player.team : null} />
                              <span className="lg:hidden truncate min-w-0">{abbreviateFirstName(player.name)}</span>
                              <span className="hidden lg:inline">{player.name}</span>
                            </span>
                          </td>
                          <td className="px-1.5 py-1.5 lg:px-6 lg:py-4">
                            <span className={`px-1.5 py-0.5 lg:px-2 lg:py-1 rounded text-[10px] lg:text-xs font-semibold ${posColors[player.pos] || "bg-gray-100 text-gray-600"}`}>
                              {displayPosRanks[player.name]}
                            </span>
                          </td>
                          <td className="hidden sm:table-cell px-6 py-4 text-gray-500">{player.team}</td>
                          {activeCreator === "consensus" && ACTIVE_CREATORS.map(c => (
                            <td key={c.id} className={`px-1 py-1.5 lg:px-6 lg:py-4 text-center lg:text-left text-[10px] lg:text-xs font-mono text-gray-400 ${showCreatorColumns ? "" : "lg:hidden"}`}>
                              {creatorPosRanks[c.id]?.[normalizeName(player.name)] || "—"}
                            </td>
                          ))}
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>

                {/* Rows 13+: blurred preview for non-subscribers */}
                {!unlocked && filteredPlayers.length > FREE_ROWS && (
                  <tbody className="blur-md select-none pointer-events-none" style={{clipPath: "inset(0)"}}>
                    {filteredPlayers.slice(FREE_ROWS, FREE_ROWS + 10).map((player, i) => {
                      const rank = FREE_ROWS + i + 1;
                      const tierNum = getTierNumber(rank, activeTiers);
                      const prevTierNum = getTierNumber(rank - 1, activeTiers);
                      const showDivider = noFilters && tierNum !== prevTierNum;
                      return (
                        <Fragment key={player.name}>
                          {showDivider && (
                            <tr>
                              <td colSpan={999} className="py-1 px-2 lg:py-1.5 lg:px-6">
                                <div className="w-full flex items-center gap-3">
                                  <div className="flex-1 h-px bg-blue-200" />
                                  <span className="text-xs font-semibold text-blue-600 tracking-wider uppercase">Tier {tierNum}</span>
                                  <div className="flex-1 h-px bg-blue-200" />
                                </div>
                              </td>
                            </tr>
                          )}
                          <tr className="border-b border-gray-100">
                            <td className="px-2 py-1.5 lg:px-6 lg:py-4 text-gray-400 font-mono text-[10px] lg:text-sm">{rank}{(() => { const m = movementCache[effectiveFormat]?.[activeCreator]?.[player.name]; if (!m) return null; return <span className={`ml-1.5 text-xs font-semibold ${m > 0 ? "text-green-600" : "text-red-500"}`}>{m > 0 ? "▲" : "▼"}{Math.abs(m)}</span>; })()}</td>
                            <td className="px-2 py-1.5 lg:px-6 lg:py-4 font-medium">
                              <span onClick={() => openPlayerModal(player)} className="cursor-pointer hover:text-blue-600 transition-colors flex items-center gap-1.5 lg:gap-2.5 text-xs lg:text-base min-w-0">
                                <PlayerHeadshot espnId={player.pos === "DST" ? null : player.espn_id} sleeperId={player.pos === "DST" ? null : player.sleeper_id} name={player.name} size="tableRow" shape="square" teamColor={teamColors(player.team).primary} label={player.pos === "DST" ? player.team : null} />
                                <span className="lg:hidden truncate min-w-0">{abbreviateFirstName(player.name)}</span>
                                <span className="hidden lg:inline">{player.name}</span>
                              </span>
                            </td>
                            <td className="px-1.5 py-1.5 lg:px-6 lg:py-4">
                              <span className={`px-1.5 py-0.5 lg:px-2 lg:py-1 rounded text-[10px] lg:text-xs font-semibold ${posColors[player.pos] || "bg-gray-100 text-gray-600"}`}>
                                {displayPosRanks[player.name]}
                              </span>
                            </td>
                            <td className="hidden sm:table-cell px-6 py-4 text-gray-500">{player.team}</td>
                            {activeCreator === "consensus" && ACTIVE_CREATORS.map(c => (
                              <td key={c.id} className={`px-1 py-1.5 lg:px-6 lg:py-4 text-center lg:text-left text-[10px] lg:text-xs font-mono text-gray-400 ${showCreatorColumns ? "" : "lg:hidden"}`}>
                                {creatorPosRanks[c.id]?.[normalizeName(player.name)] || "—"}
                              </td>
                            ))}
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                )}

                {/* Rows 13+: full unblurred list for subscribers, split at break_rank */}
                {unlocked && filteredPlayers.length > FREE_ROWS && (() => {
                  const subscriberPlayers = filteredPlayers.slice(FREE_ROWS);

                  // Find where the break falls within the subscriber slice
                  const breakIdx = breakRankForCreator != null
                    ? subscriberPlayers.findIndex((p, i) => {
                        const dr = displayRankByName[p.name] ?? (FREE_ROWS + i + 1);
                        return dr >= breakRankForCreator;
                      })
                    : -1;

                  const preBreak = breakIdx === -1 ? subscriberPlayers : subscriberPlayers.slice(0, breakIdx);
                  const postBreak = breakIdx === -1 ? [] : subscriberPlayers.slice(breakIdx);

                  function renderRow(player, globalIdx) {
                    const rank = FREE_ROWS + globalIdx + 1;
                    const tierNum = getTierNumber(rank, activeTiers);
                    const prevTierNum = getTierNumber(rank - 1, activeTiers);
                    const showDivider = noFilters && tierNum !== prevTierNum;
                    return (
                      <Fragment key={player.name}>
                        {showDivider && (
                          <tr className="select-none pointer-events-none">
                            <td colSpan={999} className="py-1 px-2 lg:py-1.5 lg:px-6">
                              <div className="w-full flex items-center gap-3">
                                <div className="flex-1 h-px bg-blue-200" />
                                <span className="text-xs font-semibold text-blue-600 tracking-wider uppercase">Tier {tierNum}</span>
                                <div className="flex-1 h-px bg-blue-200" />
                              </div>
                            </td>
                          </tr>
                        )}
                        <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="px-2 py-1.5 lg:px-6 lg:py-4 text-gray-400 font-mono text-[10px] lg:text-sm">{rank}{(() => { const m = movementCache[effectiveFormat]?.[activeCreator]?.[player.name]; if (!m) return null; return <span className={`ml-1.5 text-xs font-semibold ${m > 0 ? "text-green-600" : "text-red-500"}`}>{m > 0 ? "▲" : "▼"}{Math.abs(m)}</span>; })()}</td>
                          <td className="px-2 py-1.5 lg:px-6 lg:py-4 font-medium">
                            <span onClick={() => openPlayerModal(player)} className="cursor-pointer hover:text-blue-600 transition-colors flex items-center gap-1.5 lg:gap-2.5 text-xs lg:text-base min-w-0">
                              <PlayerHeadshot espnId={player.pos === "DST" ? null : player.espn_id} sleeperId={player.pos === "DST" ? null : player.sleeper_id} name={player.name} size="tableRow" shape="square" teamColor={teamColors(player.team).primary} label={player.pos === "DST" ? player.team : null} />
                              <span className="lg:hidden truncate min-w-0">{abbreviateFirstName(player.name)}</span>
                              <span className="hidden lg:inline">{player.name}</span>
                            </span>
                          </td>
                          <td className="px-1.5 py-1.5 lg:px-6 lg:py-4">
                            <span className={`px-1.5 py-0.5 lg:px-2 lg:py-1 rounded text-[10px] lg:text-xs font-semibold ${posColors[player.pos] || "bg-gray-100 text-gray-600"}`}>
                              {displayPosRanks[player.name]}
                            </span>
                          </td>
                          <td className="hidden sm:table-cell px-6 py-4 text-gray-500">{player.team}</td>
                          {activeCreator === "consensus" && ACTIVE_CREATORS.map(c => (
                            <td key={c.id} className={`px-1 py-1.5 lg:px-6 lg:py-4 text-center lg:text-left text-[10px] lg:text-xs font-mono text-gray-400 ${showCreatorColumns ? "" : "lg:hidden"}`}>
                              {creatorPosRanks[c.id]?.[normalizeName(player.name)] || "—"}
                            </td>
                          ))}
                        </tr>
                      </Fragment>
                    );
                  }

                  return (
                    <>
                      <tbody>
                        {preBreak.map((player, i) => renderRow(player, i))}
                      </tbody>
                      {postBreak.length > 0 && (
                        <>
                          <tbody>
                            <tr className="select-none pointer-events-none">
                              <td colSpan={999} className="py-3 px-6 bg-amber-50 border-y border-amber-200">
                                <div className="w-full flex items-center gap-3">
                                  <div className="flex-1 h-px bg-amber-300" />
                                  <span className="text-amber-700 text-xs font-semibold whitespace-nowrap">The following rankings are in progress</span>
                                  <div className="flex-1 h-px bg-amber-300" />
                                </div>
                              </td>
                            </tr>
                          </tbody>
                          <tbody className="blur-sm select-none pointer-events-none">
                            {postBreak.map((player, i) => renderRow(player, breakIdx + i))}
                          </tbody>
                        </>
                      )}
                    </>
                  );
                })()}
              </table>
            </div>

            {/* Gradient + lock CTA over blurred rows */}
            {!unlocked && lockedCount > 0 && (
              <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-white/95 via-white/60 to-transparent flex flex-col items-center justify-end pb-10 gap-3 pointer-events-none rounded-b-xl">
                <p className="text-ink font-semibold text-base pointer-events-auto">
                  🔒 {lockedCount} more players locked
                </p>
                <a
                  href="/subscribe"
                  className="pointer-events-auto bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-bold px-7 py-3 rounded-xl transition-all text-base"
                >
                  {promoActive ? <>Subscribe to unlock — <PromoPrice /></> : "Subscribe to unlock — $10/mo"}
                </a>
              </div>
            )}
          </div>
        )}
        </>
        )}

        {/* Weekly Rankings — no tiers, no Consensus; a simple per-position
            ranked list for the selected creator + week. */}
        {activeFormat === "Weekly Rankings" && (
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <CreatorAvatar
                logoUrl={weeklyCreatorProfiles[activeCreator]?.logo_url}
                initials={CREATOR_MOBILE_BADGE[activeCreator]?.label || "?"}
                colorClass="bg-blue-600"
                size="sm"
              />
              <div>
                <p className="font-bold text-ink text-sm">
                  {ACTIVE_CREATORS.find((c) => c.id === activeCreator)?.short} · Weekly Rankings
                </p>
                {weeklyWeek && <p className="text-xs text-gray-400">Week {weeklyWeek}</p>}
              </div>
            </div>

            <PillToggle
              options={ACTIVE_CREATORS.map((c) => ({ id: c.id, label: c.short }))}
              value={activeCreator}
              onChange={handleWeeklyCreatorChange}
              className="mb-4 !justify-start"
            />

            {weeklyWeeks.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-12">
                {ACTIVE_CREATORS.find((c) => c.id === activeCreator)?.short} hasn&apos;t published weekly rankings yet — check back soon.
              </p>
            ) : (
              <>
                <PillToggle
                  options={weeklyWeeks.map((w) => ({ id: String(w), label: `Week ${w}` }))}
                  value={String(weeklyWeek)}
                  onChange={(w) => setWeeklyWeek(Number(w))}
                  className="mb-4 !justify-start"
                />
                <PillToggle
                  options={WEEKLY_POSITIONS}
                  value={weeklyPosition}
                  onChange={setWeeklyPosition}
                  className="mb-5 !justify-start"
                />

                {weeklyRows.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-12">No {weeklyPosition} rankings for Week {weeklyWeek} yet.</p>
                ) : (
                  <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                    {weeklyRows.map((row, i) => {
                      const matchup = weeklyMatchups[row.players?.team];
                      return (
                      <button
                        key={row.player_id}
                        onClick={() => openPlayerModal(weeklyPoolById[row.player_id] || { id: row.player_id, ...row.players })}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left"
                      >
                        <span className="text-sm text-gray-400 font-mono w-6 shrink-0 text-right">{i + 1}</span>
                        <PlayerHeadshot espnId={row.players?.espn_id} sleeperId={row.players?.sleeper_id} name={row.players?.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink truncate">{row.players?.name}</p>
                          <p className="text-xs text-gray-400">{row.players?.position} · {row.players?.team}</p>
                        </div>
                        <span className="text-xs text-gray-400 shrink-0">
                          {matchup ? `${matchup.homeAway === "home" ? "vs" : "@"} ${matchup.opponent}` : "BYE"}
                        </span>
                      </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        </div>

        {activeFormat !== "Weekly Rankings" && (
        <aside className="w-full lg:w-72 lg:shrink-0 lg:sticky lg:top-6 order-2">
          <ConsensusMovementWidget format={effectiveFormat} />
        </aside>
        )}

      </div>

      {/* Player profile modal */}
      {playerModalOpen && selectedPlayer && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setPlayerModalOpen(false)}
        >
          <div
            className="bg-card/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-card/80 ring-1 ring-white/10 w-full max-w-xl relative"
            onClick={e => e.stopPropagation()}
          >
            {/* Close — stays outside the scrollable body below so it's always reachable */}
            <button
              onClick={() => setPlayerModalOpen(false)}
              className="absolute top-5 right-5 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/20 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/30 transition-colors text-lg leading-none font-medium"
            >
              ✕
            </button>

            {/* Scrollable body — on mobile this content can be taller than the
                viewport, and the page behind is scroll-locked while the modal
                is open, so without its own scroll region the bottom of the
                card was simply unreachable. */}
            <div className="max-h-[85vh] overflow-y-auto rounded-3xl">

            {/* Header */}
            <div
              className="relative p-7 sm:p-8 rounded-t-3xl overflow-hidden flex items-end gap-5"
              style={{backgroundImage: modalBannerGradient(selectedPlayer.team)}}
            >
              {/* Glossy highlight for a premium sheen, independent of team color */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ backgroundImage: "radial-gradient(ellipse 120% 80% at 20% -10%, rgba(255,255,255,0.18), transparent 60%)" }}
              />
              <div className="relative rounded-xl ring-2 ring-white/25 shadow-xl shrink-0">
                <PlayerHeadshot espnId={selectedPlayer.pos === "DST" ? null : selectedPlayer.espn_id} sleeperId={selectedPlayer.pos === "DST" ? null : selectedPlayer.sleeper_id} name={selectedPlayer.name} size="2xl" shape="square" label={selectedPlayer.pos === "DST" ? selectedPlayer.team : null} />
              </div>
              <div className="relative pb-0.5 min-w-0">
                <h2 className={`${anton.className} text-3xl sm:text-4xl text-white uppercase tracking-tight leading-none mb-2 truncate`}>{selectedPlayer.name}</h2>
                {(selectedPlayer.age || selectedPlayer.height_inches || selectedPlayer.weight_lbs) && (
                  <p className="inline-flex items-center gap-1 bg-black/25 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1 rounded-full mb-2.5">
                    {[
                      selectedPlayer.age ? `${selectedPlayer.age} YRS` : null,
                      selectedPlayer.height_inches ? `${Math.floor(selectedPlayer.height_inches / 12)}'${selectedPlayer.height_inches % 12}"` : null,
                      selectedPlayer.weight_lbs ? `${selectedPlayer.weight_lbs} LBS` : null,
                    ].filter(Boolean).join("  ·  ")}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-lg text-sm font-semibold text-white ${posBannerColors[selectedPlayer.pos] || "bg-card/20"}`}>
                    {displayPosRanks[selectedPlayer.name] || selectedPlayer.pos}
                  </span>
                  <span
                    className="px-2.5 py-1 rounded-lg text-sm font-semibold"
                    style={{ backgroundColor: teamColors(selectedPlayer.team).secondary, color: contrastText(teamColors(selectedPlayer.team).secondary) }}
                  >
                    {selectedPlayer.team}
                  </span>
                  {selectedPlayer.percent_rostered !== null && selectedPlayer.percent_rostered !== undefined && (
                    <span className="px-2.5 py-1 rounded-lg text-sm font-semibold bg-white/15 text-white" title="% of ESPN leagues rostering this player">
                      {Math.round(selectedPlayer.percent_rostered)}% rost.
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Risk Rating — each creator sets their own, only editable from their own tab; Consensus averages across creators */}
            <div className="px-7 pt-6">
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Risk Rating{isConsensusTab && " · Consensus"}
                </h3>
                <div className="flex items-center gap-2">
                  {displayedRisk != null && (
                    <span className="text-sm font-bold" style={{ color: riskColor(displayedRisk) }}>
                      {displayedRisk}/10
                    </span>
                  )}
                  {canEditRisk && displayedRisk != null && (
                    <button
                      onClick={() => clearRiskRating(selectedPlayer.id, activeCreator)}
                      className="text-[10px] text-gray-400 hover:text-red-500 underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {canEditRisk ? (
                <>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={displayedRisk ?? 1}
                    onChange={(e) => updateRiskRatingLocal(selectedPlayer.id, activeCreator, Number(e.target.value))}
                    onMouseUp={(e) => commitRiskRating(selectedPlayer.id, activeCreator, Number(e.target.value))}
                    onTouchEnd={(e) => commitRiskRating(selectedPlayer.id, activeCreator, Number(e.target.value))}
                    onKeyUp={(e) => commitRiskRating(selectedPlayer.id, activeCreator, Number(e.target.value))}
                    onBlur={(e) => commitRiskRating(selectedPlayer.id, activeCreator, Number(e.target.value))}
                    className="w-full accent-current"
                    style={{ color: riskColor(displayedRisk ?? 1) }}
                  />
                  <div className="flex items-center justify-between mt-1">
                    {displayedRisk == null ? (
                      <p className="text-xs text-gray-400 italic">Drag to set a rating</p>
                    ) : <span />}
                    {riskSaveStatus?.playerId === selectedPlayer.id && (
                      <p className={`text-[10px] ${
                        riskSaveStatus.status === "error" ? "text-red-500" : "text-gray-400"
                      }`}>
                        {riskSaveStatus.status === "saving" ? "Saving…" : riskSaveStatus.status === "saved" ? "Saved" : "Failed to save — try again"}
                      </p>
                    )}
                  </div>
                </>
              ) : displayedRisk != null ? (
                <>
                  <div
                    className="relative h-2 rounded-full"
                    style={{ background: `linear-gradient(to right, ${riskColor(1)}, ${riskColor(10)})` }}
                  >
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-card border-2 shadow"
                      style={{
                        left: `calc(${((displayedRisk - 1) / 9) * 100}% - 7px)`,
                        borderColor: riskColor(displayedRisk),
                      }}
                    />
                  </div>
                  {isConsensusTab && ACTIVE_CREATORS.some((c) => creatorRatings[c.id] != null) && (
                    <p className="text-[11px] text-gray-400 mt-1.5">
                      {ACTIVE_CREATORS.filter((c) => creatorRatings[c.id] != null)
                        .map((c) => `${c.short} ${creatorRatings[c.id]}`)
                        .join(" · ")}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="h-2 rounded-full bg-gray-100" />
                  <p className="text-xs text-gray-400 italic mt-1.5">
                    {isConsensusTab ? "No creators have rated this player yet" : "Risk not set"}
                  </p>
                </>
              )}
            </div>

            {/* Waiver Wire — this week's mentions across creators, if any */}
            {!waiverMentionsLoading && waiverMentions.length > 0 && (
              <div className="px-7 pt-6 border-t border-white/10">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5">
                  Waiver Wire · Week {weeklyCurrentNflWeek}
                </h3>
                <div className="space-y-2">
                  {waiverMentions.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-2 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-semibold text-ink shrink-0">
                          {ACTIVE_CREATORS.find((c) => c.id === m.creator_id)?.short || m.creator_id}
                        </span>
                        <span className="text-xs text-gray-400 truncate">
                          {WAIVER_CATEGORY_LABELS[m.category] || m.category}{m.position ? ` · ${m.position}` : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {m.term && (
                          <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                            m.term === "short" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                          }`}>
                            {m.term}
                          </span>
                        )}
                        {m.faab_pct !== null && m.faab_pct !== undefined && (
                          <span className="text-xs font-semibold text-ink">{Number(m.faab_pct).toFixed(1)}%</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Previous Season Stats */}
            {!seasonStatsLoading && seasonStats && (
              <div className="px-7 pt-6 border-t border-white/10">
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{seasonStats.season} Season</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-ink">{seasonStats.fantasy_points} pts</span>
                    {seasonStats.fantasy_finish && (
                      <span className="text-[10px] font-bold uppercase bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                        {seasonStats.position}{seasonStats.fantasy_finish}
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                  {seasonStatLine(seasonStats.position, seasonStats.stats).map((s) => (
                    <div key={s.label} className="bg-white/5 border border-white/10 rounded-xl px-2.5 py-2 text-center">
                      <p className="text-sm font-bold text-ink">{s.value}</p>
                      <p className="text-[9px] text-gray-400 uppercase tracking-wide">{s.label}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 mt-2">Full PPR scoring · {seasonStats.games_played} games played</p>
              </div>
            )}

            {/* Rankings table */}
            <div className="p-7 border-t border-white/10">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3.5">Rankings by Format</h3>
              {playerRankingsLoading ? (
                <p className="text-gray-400 text-sm py-6 text-center">Loading...</p>
              ) : (
                <div className="relative pl-4">
                  {/* Active-format indicator dot — sits in the gutter outside the
                      glowing row, aligned to the active row's fixed position (it's
                      always sorted to the first data row, right below the header). */}
                  <span className="absolute left-0 top-[66px] -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(37,99,235,0.9)]" />
                  <div className="rounded-xl overflow-hidden border border-white/10">
                    <table className="w-full text-sm">
                      <thead className="bg-white/5 text-gray-500">
                        <tr>
                          <th className="text-left px-4 py-3 font-medium">Format</th>
                          <th className="text-center px-4 py-3 font-medium">Consensus</th>
                          <th className="text-center px-4 py-3 font-medium">RookieRager</th>
                          <th className="text-center px-4 py-3 font-medium">FFHuddle</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[activeFormat, ...FORMATS.filter(fmt => fmt !== activeFormat)].map(fmt => {
                          const row = playerRankings[fmt] || {};
                          const isActive = fmt === activeFormat;
                          return (
                            <tr
                              key={fmt}
                              className={`border-t transition-colors ${
                                isActive
                                  ? "relative z-10 border-blue-200 bg-blue-50 ring-2 ring-inset ring-blue-400 shadow-[0_0_18px_rgba(37,99,235,0.45)]"
                                  : "border-white/10 hover:bg-white/5"
                              }`}
                            >
                              <td className="px-4 py-3.5 font-medium text-ink">{fmt}</td>
                              <td className="px-4 py-3.5 text-center text-gray-600">{row.consensus ?? "—"}</td>
                              <td className="px-4 py-3.5 text-center text-gray-600">{row.rookierager ?? "—"}</td>
                              <td className="px-4 py-3.5 text-center text-gray-600">{row.ffhuddle ?? "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            </div>
          </div>
        </div>
      )}
      {/* Scroll to top */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-20 sm:bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-card/80 backdrop-blur-md border border-card/80 shadow-lg text-gray-500 hover:text-gray-900 hover:bg-card transition-all text-sm font-medium"
          aria-label="Scroll to top"
        >
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 12 9 6 15 12" />
          </svg>
          Scroll to top
        </button>
      )}
    </main>
  );
}
