"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import NavBar from "@/app/components/NavBar";
import PlayerHeadshot from "@/app/components/PlayerHeadshot";
import PromoPrice from "@/app/components/PromoPrice";
import { isPromoActive } from "@/lib/promo";
import AdpMovementWidget from "@/app/components/AdpMovementWidget";

const FORMATS = ["Redraft 1QB", "Redraft SF", "Dynasty 1QB", "Dynasty SF"];

const CREATORS = [
  { id: "rookierager", name: "RookieRager", short: "RookieRager" },
  { id: "ffhuddle", name: "FantasyFootballHuddle", short: "FFHuddle" },
  { id: "coming-soon-3", name: "Coming Soon", comingSoon: true },
  { id: "coming-soon-4", name: "Coming Soon", comingSoon: true },
];

const ACTIVE_CREATORS = CREATORS.filter(c => !c.comingSoon);

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
};

// Vivid variants for the player modal's dark banner, where posColors' light
// backgrounds would have poor contrast.
const posBannerColors = {
  WR: "bg-blue-400",
  RB: "bg-green-500",
  QB: "bg-red-500",
  TE: "bg-amber-500",
};

// Each team's primary/secondary brand colors, used for the player modal
// banner (primary, as tonal shades of itself) and the team badge (secondary).
// Falls back to the site's default blue for free agents / unknown teams.
const TEAM_COLORS = {
  ARI: ["#97233F", "#000000"], ATL: ["#A71930", "#000000"], BAL: ["#241773", "#000000"],
  BUF: ["#00338D", "#C60C30"], CAR: ["#0085CA", "#101820"], CHI: ["#0B162A", "#C83803"],
  CIN: ["#FB4F14", "#000000"], CLE: ["#311D00", "#FF3C00"], DAL: ["#041E42", "#869397"],
  DEN: ["#FB4F14", "#002244"], DET: ["#0076B6", "#B0B7BC"], GB: ["#203731", "#FFB612"],
  HOU: ["#03202F", "#A71930"], IND: ["#002C5F", "#A2AAAD"], JAX: ["#101820", "#006778"],
  KC: ["#E31837", "#FFB81C"], LAC: ["#0080C6", "#FFC20E"], LAR: ["#003594", "#FFA300"],
  LV: ["#000000", "#A5ACAF"], MIA: ["#008E97", "#FC4C02"], MIN: ["#4F2683", "#FFC62F"],
  NE: ["#002244", "#C60C30"], NO: ["#101820", "#D3BC8D"], NYG: ["#0B2265", "#A71930"],
  NYJ: ["#125740", "#000000"], PHI: ["#004C54", "#A5ACAF"], PIT: ["#101820", "#FFB612"],
  SEA: ["#002244", "#69BE28"], SF: ["#AA0000", "#B3995D"], TB: ["#D50A0A", "#34302B"],
  TEN: ["#0C2340", "#4B92DB"], WAS: ["#5A1414", "#FFB612"],
};
const DEFAULT_TEAM_COLORS = ["#2563EB", "#1E40AF"];

function teamColors(team) {
  const [primary, secondary] = TEAM_COLORS[team] || DEFAULT_TEAM_COLORS;
  return { primary, secondary };
}

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
  const [activeFormat, setActiveFormat] = useState(FORMATS[0]);
  const [activeCreator, setActiveCreator] = useState("consensus");
  const [rankingsCache, setRankingsCache] = useState({});
  const [rankingsLoading, setRankingsLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [playerPool, setPlayerPool] = useState([]);
  const [poolLoaded, setPoolLoaded] = useState(false);
  const [isDashboardUser, setIsDashboardUser] = useState(false);
  const [showCreatorColumns, setShowCreatorColumns] = useState(true);
  const [search, setSearch] = useState("");
  const [posFilter, setPosFilter] = useState("All");
  const [teamFilter, setTeamFilter] = useState("All");
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerModalOpen, setPlayerModalOpen] = useState(false);
  const [playerRankings, setPlayerRankings] = useState({});
  const [playerRankingsLoading, setPlayerRankingsLoading] = useState(false);
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
      const { data } = await supabase
        .from("players")
        .select("id, name, position, team, sleeper_id, espn_id, height_inches, weight_lbs, age")
        .order("adp_rank");
      setPlayerPool((data || []).map(p => ({ id: p.id, name: p.name, pos: p.position, team: p.team || "FA", sleeper_id: p.sleeper_id, espn_id: p.espn_id, height_inches: p.height_inches, weight_lbs: p.weight_lbs, age: p.age })));
      setPoolLoaded(true);
    }
    loadPool();
  }, []);

  useEffect(() => {
    async function loadAuth() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        const [{ data: sub }, { data: prof }] = await Promise.all([
          supabase.from("subscriptions").select("status").eq("user_id", user.id).eq("status", "active").maybeSingle(),
          supabase.from("profiles").select("role, is_creator").eq("id", user.id).maybeSingle(),
        ]);
        setIsSubscribed(!!sub);
        setIsDashboardUser(!!(prof && (prof.role === "admin" || prof.is_creator)));
      }
      setAuthLoaded(true);
    }
    loadAuth();
  }, []);

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
    const cachedFormat = rankingsCache[activeFormat];

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
          const res = await fetch(`/api/rankings?format=${encodeURIComponent(activeFormat)}`);
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
            [activeFormat]: { ...(prev[activeFormat] || {}), ...formatMap },
          }));
          setUpdatedAtCache(prev => ({
            ...prev,
            [activeFormat]: { ...(prev[activeFormat] || {}), ...updatedAtMap },
          }));
          setLockedCache(prev => ({
            ...prev,
            [activeFormat]: { ...(prev[activeFormat] || {}), ...lockedMap },
          }));
          fetch(`/api/rankings/movement?format=${encodeURIComponent(activeFormat)}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
              if (data?.movement) setMovementCache(prev => ({ ...prev, [activeFormat]: { ...(prev[activeFormat] || {}), consensus: data.movement } }));
            })
            .catch(() => {});
        } else {
          const res = await fetch(
            `/api/rankings?creator_id=${encodeURIComponent(activeCreator)}&format=${encodeURIComponent(activeFormat)}`
          );
          const { players, tiers, updatedAt, locked, break_rank } = await res.json();
          setRankingsCache(prev => ({
            ...prev,
            [activeFormat]: { ...(prev[activeFormat] || {}), [activeCreator]: players || [] },
          }));
          if (tiers && tiers.length > 0) {
            setTiersCache(prev => ({
              ...prev,
              [activeFormat]: { ...(prev[activeFormat] || {}), [activeCreator]: tiers },
            }));
          }
          if (updatedAt) {
            setUpdatedAtCache(prev => ({
              ...prev,
              [activeFormat]: { ...(prev[activeFormat] || {}), [activeCreator]: updatedAt },
            }));
          }
          setLockedCache(prev => ({
            ...prev,
            [activeFormat]: { ...(prev[activeFormat] || {}), [activeCreator]: locked || false },
          }));
          setBreakRankCache(prev => ({
            ...prev,
            [activeFormat]: { ...(prev[activeFormat] || {}), [activeCreator]: break_rank ?? null },
          }));
          fetch(`/api/rankings/movement?creator_id=${encodeURIComponent(activeCreator)}&format=${encodeURIComponent(activeFormat)}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
              if (data?.movement) setMovementCache(prev => ({ ...prev, [activeFormat]: { ...(prev[activeFormat] || {}), [activeCreator]: data.movement } }));
            })
            .catch(() => {});
        }
      } catch (err) {
        console.error("Failed to fetch rankings:", err);
      }
      setRankingsLoading(false);
    }
    fetchRankings();
  }, [activeFormat, activeCreator]);

  function handleFormatChange(format) {
    setActiveFormat(format);
    setActiveCreator("consensus");
  }

  const formatData = rankingsCache[activeFormat];
  const rankingsFetched = formatData !== undefined;
  const stillLoading = rankingsLoading || !rankingsFetched || !poolLoaded || !authLoaded;

  let displayPlayers = null;
  let hasData = false;

  const lockedForFormat = lockedCache[activeFormat] || {};
  // Individual creator tab locked for this viewer (admins/creators bypass)
  const isCreatorLocked = activeCreator !== "consensus" && !isDashboardUser && !!lockedForFormat[activeCreator];

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

  let filteredPlayers = displayPlayers;
  if (filteredPlayers && search.trim()) {
    filteredPlayers = filteredPlayers.filter(p => p.name.toLowerCase().includes(search.toLowerCase().trim()));
  }
  if (filteredPlayers && posFilter !== "All") {
    filteredPlayers = filteredPlayers.filter(p => p.pos === posFilter);
  }
  if (filteredPlayers && teamFilter !== "All") {
    filteredPlayers = filteredPlayers.filter(p => p.team === teamFilter);
  }

  const lockedCount = filteredPlayers ? Math.max(0, filteredPlayers.length - FREE_ROWS) : 0;
  const activeTiers = activeCreator === "consensus"
    ? DEFAULT_TIERS
    : (tiersCache[activeFormat]?.[activeCreator] || DEFAULT_TIERS);
  const noFilters = !search.trim() && posFilter === "All" && teamFilter === "All";

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
    ? (breakRankCache[activeFormat]?.[activeCreator] ?? null)
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
    <main className="min-h-screen text-[#0F172A] lg:pl-56">
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
              <h2 className="text-3xl sm:text-5xl md:text-6xl font-bold mb-6 text-[#0F172A] leading-tight">
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
                  className="w-full sm:w-auto bg-white/70 backdrop-blur-sm border border-white/80 text-[#0F172A] font-semibold px-8 py-4 rounded-xl text-lg hover:bg-white/90 transition-all"
                >
                  See Rankings ↓
                </button>
              </div>
            </div>
          </div>

          {/* Bridge to rankings */}
          <div className="max-w-5xl mx-auto px-6 pb-4 text-center">
            <h3 className="text-2xl font-bold mb-1 text-[#0F172A]">Preview the Rankings</h3>
            <p className="text-gray-500 text-sm">First 12 players are free. Subscribe to unlock the full list.</p>
          </div>
        </div>
      )}

      {/* Subscriber header — shown instead of the full landing */}
      {authLoaded && (isSubscribed || isDashboardUser) && (
        <div className="max-w-5xl mx-auto px-6 pt-10 pb-2">
          <h2 className="text-3xl font-bold text-[#0F172A]">Rankings</h2>
          <p className="text-gray-500 mt-1">Expert consensus rankings across all formats.</p>
        </div>
      )}

      {/* Rankings Section */}
      <div className="w-full px-6 lg:px-8 pt-6 pb-20 flex flex-col lg:flex-row gap-6 items-start">

        <div ref={rankingsRef} className="flex-1 min-w-0 order-1">

        {/* Format tabs */}
        <div className="flex flex-wrap gap-1 mb-5 lg:flex-nowrap lg:gap-2 lg:overflow-x-auto lg:pb-1">
          {FORMATS.map(fmt => (
            <button
              key={fmt}
              onClick={() => handleFormatChange(fmt)}
              className={`flex-1 lg:flex-none text-center px-2 py-2.5 text-xs lg:px-4 lg:py-2 lg:text-sm rounded-lg font-medium transition-colors lg:shrink-0 ${
                activeFormat === fmt
                  ? "bg-gradient-to-br from-[#2563EB] to-[#1E40AF] text-white"
                  : "bg-white/60 backdrop-blur-sm text-gray-600 hover:bg-white/80 border border-white/70"
              }`}
            >
              <span className="lg:hidden">{abbreviateFormat(fmt)}</span>
              <span className="hidden lg:inline">{fmt}</span>
            </button>
          ))}
        </div>

        {/* Creator tabs + toggle */}
        {(() => {
          const creatorTabItems = [{ id: "consensus", name: "Consensus" }, ...CREATORS].map(creator => {
            let dateLabel = null;
            if (!creator.comingSoon) {
              if (creator.id === "consensus") {
                const formatTimestamps = Object.values(updatedAtCache[activeFormat] || {}).filter(Boolean);
                const latest = formatTimestamps.sort().reverse()[0];
                dateLabel = formatUpdatedAt(latest);
              } else {
                dateLabel = formatUpdatedAt(updatedAtCache[activeFormat]?.[creator.id]);
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
                  className="w-full bg-white/60 backdrop-blur-sm border border-white/70 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                      : "bg-white/60 backdrop-blur-sm text-gray-600 border border-white/70 hover:bg-white/80"
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
              {["All", "QB", "RB", "WR", "TE"].map(pos => (
                <button
                  key={pos}
                  onClick={() => setPosFilter(pos)}
                  className={`px-2.5 py-1 text-xs lg:px-3 lg:py-1.5 lg:text-sm rounded-lg font-medium transition-colors shrink-0 ${
                    posFilter === pos
                      ? "bg-blue-600 text-white"
                      : "bg-white/60 backdrop-blur-sm text-gray-600 border border-white/70 hover:bg-white/80"
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
                    : "bg-white/60 backdrop-blur-sm text-gray-600 border-white/70 hover:bg-white/80"
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
                className="w-full bg-white/60 backdrop-blur-sm border border-white/70 rounded-xl px-4 py-2.5 text-[#0F172A] placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </>
        )}

        {/* Table area */}
        {stillLoading ? (
          <div className="bg-white/70 backdrop-blur-md rounded-xl border border-white/80 shadow-lg py-16 text-center text-gray-400">
            Loading...
          </div>
        ) : CREATORS.find(c => c.id === activeCreator)?.comingSoon ? (
          <div className="bg-white/70 backdrop-blur-md rounded-xl border border-white/80 shadow-lg py-16 text-center">
            <p className="text-gray-500 font-medium mb-1">Creator coming soon</p>
            <p className="text-gray-400 text-sm">This creator spot is opening up. Stay tuned.</p>
          </div>
        ) : isCreatorLocked ? (
          <div className="bg-white/70 backdrop-blur-md rounded-xl border border-amber-200 shadow-lg py-16 text-center px-6">
            <p className="text-2xl mb-3">🔄</p>
            <p className="text-[#0F172A] font-semibold mb-1">Rankings in progress</p>
            <p className="text-gray-500 text-sm">This creator is currently updating their {activeFormat} rankings. Check back soon.</p>
          </div>
        ) : !hasData ? (
          <div className="bg-white/70 backdrop-blur-md rounded-xl border border-white/80 shadow-lg py-16 text-center">
            <p className="text-gray-500 font-medium mb-1">Rankings coming soon</p>
            <p className="text-gray-400 text-sm">
              {activeCreator === "consensus"
                ? "No creators have published rankings for this format yet."
                : `${CREATORS.find(c => c.id === activeCreator)?.name} hasn't published ${activeFormat} rankings yet.`}
            </p>
          </div>
        ) : filteredPlayers && filteredPlayers.length === 0 ? (
          <div className="bg-white/70 backdrop-blur-md rounded-xl border border-white/80 shadow-lg py-16 text-center">
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
            <div className="bg-white/60 backdrop-blur-md rounded-xl overflow-hidden border border-white/70 shadow-lg">
              <table className="w-full">
                <thead className="bg-white/40 text-gray-500 text-xs lg:text-sm">
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
                          <td className="px-2 py-1.5 lg:px-6 lg:py-4 text-gray-400 font-mono text-[10px] lg:text-sm">{rank}{(() => { const m = movementCache[activeFormat]?.[activeCreator]?.[player.name]; if (!m) return null; return <span className={`ml-1.5 text-xs font-semibold ${m > 0 ? "text-green-600" : "text-red-500"}`}>{m > 0 ? "▲" : "▼"}{Math.abs(m)}</span>; })()}</td>
                          <td className="px-2 py-1.5 lg:px-6 lg:py-4 font-medium">
                            <span onClick={() => openPlayerModal(player)} className="cursor-pointer hover:text-blue-600 transition-colors flex items-center gap-1.5 lg:gap-2.5 text-xs lg:text-base min-w-0">
                              <PlayerHeadshot espnId={player.espn_id} sleeperId={player.sleeper_id} name={player.name} size="tableRow" />
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
                            <td className="px-2 py-1.5 lg:px-6 lg:py-4 text-gray-400 font-mono text-[10px] lg:text-sm">{rank}{(() => { const m = movementCache[activeFormat]?.[activeCreator]?.[player.name]; if (!m) return null; return <span className={`ml-1.5 text-xs font-semibold ${m > 0 ? "text-green-600" : "text-red-500"}`}>{m > 0 ? "▲" : "▼"}{Math.abs(m)}</span>; })()}</td>
                            <td className="px-2 py-1.5 lg:px-6 lg:py-4 font-medium">
                              <span onClick={() => openPlayerModal(player)} className="cursor-pointer hover:text-blue-600 transition-colors flex items-center gap-1.5 lg:gap-2.5 text-xs lg:text-base min-w-0">
                                <PlayerHeadshot espnId={player.espn_id} sleeperId={player.sleeper_id} name={player.name} size="tableRow" />
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
                          <td className="px-2 py-1.5 lg:px-6 lg:py-4 text-gray-400 font-mono text-[10px] lg:text-sm">{rank}{(() => { const m = movementCache[activeFormat]?.[activeCreator]?.[player.name]; if (!m) return null; return <span className={`ml-1.5 text-xs font-semibold ${m > 0 ? "text-green-600" : "text-red-500"}`}>{m > 0 ? "▲" : "▼"}{Math.abs(m)}</span>; })()}</td>
                          <td className="px-2 py-1.5 lg:px-6 lg:py-4 font-medium">
                            <span onClick={() => openPlayerModal(player)} className="cursor-pointer hover:text-blue-600 transition-colors flex items-center gap-1.5 lg:gap-2.5 text-xs lg:text-base min-w-0">
                              <PlayerHeadshot espnId={player.espn_id} sleeperId={player.sleeper_id} name={player.name} size="tableRow" />
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
                <p className="text-[#0F172A] font-semibold text-base pointer-events-auto">
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

        </div>

        <aside className="w-full lg:w-72 lg:shrink-0 lg:sticky lg:top-6 order-2">
          <AdpMovementWidget />
        </aside>

      </div>

      {/* Player profile modal */}
      {playerModalOpen && selectedPlayer && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setPlayerModalOpen(false)}
        >
          <div
            className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/80 w-full max-w-lg relative"
            onClick={e => e.stopPropagation()}
          >
            {/* Close */}
            <button
              onClick={() => setPlayerModalOpen(false)}
              className="absolute top-4 right-4 z-10 text-white/80 hover:text-white transition-colors text-lg leading-none font-medium"
            >
              ✕
            </button>

            {/* Header */}
            <div
              className="relative p-6 rounded-t-2xl overflow-hidden flex items-end gap-4"
              style={{backgroundImage: modalBannerGradient(selectedPlayer.team)}}
            >
              <PlayerHeadshot espnId={selectedPlayer.espn_id} sleeperId={selectedPlayer.sleeper_id} name={selectedPlayer.name} size="xl" shape="square" />
              <div className="pb-0.5 min-w-0">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white uppercase tracking-tight leading-none mb-1.5 truncate">{selectedPlayer.name}</h2>
                {(selectedPlayer.age || selectedPlayer.height_inches || selectedPlayer.weight_lbs) && (
                  <p className="text-blue-100 text-sm font-medium mb-2">
                    {[
                      selectedPlayer.age ? `${selectedPlayer.age}` : null,
                      selectedPlayer.height_inches ? `${Math.floor(selectedPlayer.height_inches / 12)}'${selectedPlayer.height_inches % 12}"` : null,
                      selectedPlayer.weight_lbs ? `${selectedPlayer.weight_lbs} LBS` : null,
                    ].filter(Boolean).join(" | ")}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-lg text-sm font-semibold text-white ${posBannerColors[selectedPlayer.pos] || "bg-white/20"}`}>
                    {displayPosRanks[selectedPlayer.name] || selectedPlayer.pos}
                  </span>
                  <span
                    className="px-2.5 py-1 rounded-lg text-sm font-semibold"
                    style={{ backgroundColor: teamColors(selectedPlayer.team).secondary, color: contrastText(teamColors(selectedPlayer.team).secondary) }}
                  >
                    {selectedPlayer.team}
                  </span>
                </div>
              </div>
            </div>

            {/* Rankings table */}
            <div className="p-6">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Rankings by Format</h3>
              {playerRankingsLoading ? (
                <p className="text-gray-400 text-sm py-6 text-center">Loading...</p>
              ) : (
                <div className="rounded-xl overflow-hidden border border-gray-100">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium">Format</th>
                        <th className="text-center px-4 py-2.5 font-medium">Consensus</th>
                        <th className="text-center px-4 py-2.5 font-medium">RookieRager</th>
                        <th className="text-center px-4 py-2.5 font-medium">FFHuddle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FORMATS.map(fmt => {
                        const row = playerRankings[fmt] || {};
                        return (
                          <tr key={fmt} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 font-medium text-[#0F172A]">{fmt}</td>
                            <td className="px-4 py-3 text-center text-gray-600">{row.consensus ?? "—"}</td>
                            <td className="px-4 py-3 text-center text-gray-600">{row.rookierager ?? "—"}</td>
                            <td className="px-4 py-3 text-center text-gray-600">{row.ffhuddle ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Scroll to top */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-20 sm:bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/80 backdrop-blur-md border border-white/80 shadow-lg text-gray-500 hover:text-gray-900 hover:bg-white transition-all text-sm font-medium"
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
