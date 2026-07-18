"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import NavBar from "@/app/components/NavBar";

const FORMATS = ["Dynasty SF", "Dynasty 1QB", "Redraft 1QB", "Redraft SF"];

const CREATORS = [
  { id: "rookierager", name: "RookieRager", short: "RookieRager" },
  { id: "ffhuddle", name: "FantasyFootballHuddle", short: "FFHuddle" },
  { id: "coming-soon-3", name: "Coming Soon", comingSoon: true },
  { id: "coming-soon-4", name: "Coming Soon", comingSoon: true },
];

const ACTIVE_CREATORS = CREATORS.filter(c => !c.comingSoon);

const posColors = {
  WR: "bg-blue-100 text-blue-700",
  RB: "bg-green-100 text-green-700",
  QB: "bg-red-100 text-red-700",
  TE: "bg-amber-100 text-amber-700",
};

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
        .select("id, name, position, team")
        .order("adp_rank");
      setPlayerPool((data || []).map(p => ({ id: p.id, name: p.name, pos: p.position, team: p.team || "FA" })));
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
      if (cachedFormat && cachedFormat[activeCreator] !== undefined) return;
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
          const { players, tiers, updatedAt, locked } = await res.json();
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
    <main className="min-h-screen text-[#0F172A]">
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
                  Get Access — $10/mo
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

          {/* How it works */}
          <div className="max-w-5xl mx-auto px-6 py-16">
            <h3 className="text-center text-3xl font-bold mb-2 text-[#0F172A]">How It Works</h3>
            <p className="text-center text-gray-500 mb-12">From zero to dominating your league in three steps</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { step: "1", title: "Subscribe for $10/mo", desc: "Unlock all rankings across every format — Dynasty SF, Dynasty 1QB, Redraft 1QB, and Redraft SF. Updated weekly." },
                { step: "2", title: "Choose your creator community", desc: "Join RookieRager or FantasyFootballHuddle. Get access to their expert analysis, rankings, and content all season." },
                { step: "3", title: "Dominate your league", desc: "Use the consensus rankings or drill into each creator's individual picks to build your perfect draft strategy." },
              ].map(({ step, title, desc }) => (
                <div key={step} className="bg-white/70 backdrop-blur-md rounded-xl p-6 border border-white/80 shadow-lg text-center">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#2563EB] to-[#1E40AF] text-white font-bold text-xl flex items-center justify-center mx-auto mb-4">
                    {step}
                  </div>
                  <h4 className="font-bold text-lg mb-2 text-[#0F172A]">{title}</h4>
                  <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Creators */}
          <div className="max-w-5xl mx-auto px-6 py-8">
            <h3 className="text-center text-3xl font-bold mb-2 text-[#0F172A]">Meet the Creators</h3>
            <p className="text-center text-gray-500 mb-10">Expert analysts with proven track records</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { path: "/creators/dynastydave", name: "RookieRager", handle: "@rookierager", avatar: "RR", color: "bg-green-600", bio: "10 years of dynasty experience. Known for elite TE and QB analysis in superflex formats.", specialty: "Dynasty SF" },
                { path: "/creators/redraftking", name: "FantasyFootballHuddle", handle: "@ffhuddle", avatar: "FFH", color: "bg-blue-600", bio: "Season-long specialist. ADP beater and waiver wire wizard. 3x contest winner.", specialty: "Redraft" },
              ].map(creator => (
                <div key={creator.name} className="bg-white/70 backdrop-blur-md rounded-xl p-6 border border-white/80 shadow-lg">
                  <div className="flex items-start gap-4 mb-4">
                    <div className={`${creator.color} w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0`}>
                      {creator.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-lg text-[#0F172A]">{creator.name}</h4>
                        <span className="bg-blue-50 text-blue-700 text-xs px-2.5 py-0.5 rounded-full font-medium">{creator.specialty}</span>
                      </div>
                      <p className="text-gray-500 text-sm">{creator.handle}</p>
                    </div>
                  </div>
                  <p className="text-gray-500 text-sm mb-5 leading-relaxed">{creator.bio}</p>
                  <a href={creator.path} className="inline-block bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-all">
                    View Community →
                  </a>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing */}
          <div className="max-w-5xl mx-auto px-6 py-16">
            <h3 className="text-center text-3xl font-bold mb-2 text-[#0F172A]">Simple Pricing</h3>
            <p className="text-center text-gray-500 mb-10">No tiers, no confusion. One plan with optional add-ons.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
              <div className="bg-white/70 backdrop-blur-md rounded-xl p-6 border-2 border-blue-500 shadow-lg flex flex-col">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h4 className="font-bold text-xl text-[#0F172A]">Base Plan</h4>
                    <p className="text-gray-500 text-xs mt-0.5">Everything you need</p>
                  </div>
                  <div className="text-right">
                    <span className="text-3xl font-bold text-blue-600">$10</span>
                    <span className="text-gray-400 text-sm">/mo</span>
                  </div>
                </div>
                <ul className="space-y-2 mb-6 flex-1">
                  {["All 4 ranking formats", "Consensus rankings from all creators", "Dynasty SF & Dynasty 1QB", "Redraft 1QB & Redraft SF", "1 creator community included", "Rankings updated all season"].map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="text-green-500 font-bold shrink-0">✓</span> {f}
                    </li>
                  ))}
                </ul>
                <a href="/subscribe" className="block text-center bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-bold py-3 rounded-xl transition-all">
                  Get Started
                </a>
              </div>
              <div className="bg-white/70 backdrop-blur-md rounded-xl p-6 border border-white/80 shadow-lg flex flex-col">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h4 className="font-bold text-xl text-[#0F172A]">Community Add-on</h4>
                    <p className="text-gray-500 text-xs mt-0.5">Per extra community</p>
                  </div>
                  <div className="text-right">
                    <span className="text-3xl font-bold text-blue-600">$5</span>
                    <span className="text-gray-400 text-sm">/mo</span>
                  </div>
                </div>
                <ul className="space-y-2 mb-6 flex-1">
                  {["Access an additional creator community", "Creator-specific rankings & analysis", "Posts and content from that creator", "Stack as many as you like"].map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="text-green-500 font-bold shrink-0">✓</span> {f}
                    </li>
                  ))}
                </ul>
                <a href="/subscribe" className="block text-center bg-white/60 backdrop-blur-sm border border-white/70 text-[#0F172A] font-bold py-3 rounded-xl hover:bg-white/80 transition-all">
                  Add to Plan
                </a>
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
      <div ref={rankingsRef} className="max-w-5xl mx-auto px-6 pt-6 pb-20">

        {/* Format tabs */}
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          {FORMATS.map(fmt => (
            <button
              key={fmt}
              onClick={() => handleFormatChange(fmt)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0 ${
                activeFormat === fmt
                  ? "bg-gradient-to-br from-[#2563EB] to-[#1E40AF] text-white"
                  : "bg-white/60 backdrop-blur-sm text-gray-600 hover:bg-white/80 border border-white/70"
              }`}
            >
              {fmt}
            </button>
          ))}
        </div>

        {/* Creator tabs + toggle */}
        <div className="flex items-center gap-2 mb-6 border-b border-gray-200">
          <div className="overflow-x-auto flex-1 min-w-0">
            <div className="flex flex-nowrap">
              {[{ id: "consensus", name: "Consensus" }, ...CREATORS].map(creator => {
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
                return (
                  <button
                    key={creator.id}
                    onClick={() => !creator.comingSoon && setActiveCreator(creator.id)}
                    disabled={creator.comingSoon}
                    className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px shrink-0 text-left ${
                      creator.comingSoon
                        ? "border-transparent text-gray-300 cursor-not-allowed italic"
                        : activeCreator === creator.id
                          ? "border-blue-600 text-blue-600"
                          : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    <span className="block leading-5">{creator.name}</span>
                    {dateLabel && (
                      <span className={`block text-xs font-normal leading-4 mt-0.5 ${
                        activeCreator === creator.id ? "text-blue-400" : "text-gray-400"
                      }`}>
                        {dateLabel}
                      </span>
                    )}
                  </button>
                );
              })}
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

        {/* Position filters + team filter + search */}
        {!stillLoading && hasData && (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {["All", "QB", "RB", "WR", "TE"].map(pos => (
                <button
                  key={pos}
                  onClick={() => setPosFilter(pos)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shrink-0 ${
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
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 ${
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
                <thead className="bg-white/40 text-gray-500 text-sm">
                  <tr>
                    <th className="text-left px-6 py-3 w-16">Rank</th>
                    <th className="text-left px-6 py-3">Player</th>
                    <th className="text-left px-6 py-3">Position</th>
                    <th className="hidden sm:table-cell text-left px-6 py-3">Team</th>
                    {showCreatorColumns && activeCreator === "consensus" && ACTIVE_CREATORS.map(c => (
                      <th key={c.id} className="hidden sm:table-cell text-left px-6 py-3 whitespace-nowrap">{c.short}</th>
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
                    const colSpan = 4 + (showCreatorColumns && activeCreator === "consensus" ? ACTIVE_CREATORS.length : 0);
                    return (
                      <Fragment key={player.name}>
                        {showDivider && (
                          <tr className="select-none pointer-events-none">
                            <td colSpan={colSpan} className="py-1.5 px-6">
                              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                                <div className="h-px bg-blue-200" />
                                <span className="text-xs font-semibold text-blue-600 tracking-wider uppercase">Tier {tierNum}</span>
                                <div className="h-px bg-blue-200" />
                              </div>
                            </td>
                          </tr>
                        )}
                        <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 text-gray-400 font-mono text-sm">{rank}{(() => { const m = movementCache[activeFormat]?.[activeCreator]?.[player.name]; if (!m) return null; return <span className={`ml-1.5 text-xs font-semibold ${m > 0 ? "text-green-600" : "text-red-500"}`}>{m > 0 ? "▲" : "▼"}{Math.abs(m)}</span>; })()}</td>
                          <td className="px-6 py-4 font-medium">
                            <span onClick={() => openPlayerModal(player)} className="cursor-pointer hover:text-blue-600 transition-colors">
                              {player.name}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${posColors[player.pos] || "bg-gray-100 text-gray-600"}`}>
                              {displayPosRanks[player.name]}
                            </span>
                          </td>
                          <td className="hidden sm:table-cell px-6 py-4 text-gray-500">{player.team}</td>
                          {showCreatorColumns && activeCreator === "consensus" && ACTIVE_CREATORS.map(c => (
                            <td key={c.id} className="hidden sm:table-cell px-6 py-4 text-xs font-mono text-gray-400">
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
                      const colSpan = 4 + (showCreatorColumns && activeCreator === "consensus" ? ACTIVE_CREATORS.length : 0);
                      return (
                        <Fragment key={player.name}>
                          {showDivider && (
                            <tr>
                              <td colSpan={colSpan} className="py-1.5 px-6">
                                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                                  <div className="h-px bg-blue-200" />
                                  <span className="text-xs font-semibold text-blue-600 tracking-wider uppercase">Tier {tierNum}</span>
                                  <div className="h-px bg-blue-200" />
                                </div>
                              </td>
                            </tr>
                          )}
                          <tr className="border-b border-gray-100">
                            <td className="px-6 py-4 text-gray-400 font-mono text-sm">{rank}{(() => { const m = movementCache[activeFormat]?.[activeCreator]?.[player.name]; if (!m) return null; return <span className={`ml-1.5 text-xs font-semibold ${m > 0 ? "text-green-600" : "text-red-500"}`}>{m > 0 ? "▲" : "▼"}{Math.abs(m)}</span>; })()}</td>
                            <td className="px-6 py-4 font-medium">
                              <span onClick={() => openPlayerModal(player)} className="cursor-pointer hover:text-blue-600 transition-colors">
                                {player.name}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${posColors[player.pos] || "bg-gray-100 text-gray-600"}`}>
                                {displayPosRanks[player.name]}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-gray-500">{player.team}</td>
                            {showCreatorColumns && activeCreator === "consensus" && ACTIVE_CREATORS.map(c => (
                              <td key={c.id} className="px-6 py-4 text-xs font-mono text-gray-400">
                                {creatorPosRanks[c.id]?.[normalizeName(player.name)] || "—"}
                              </td>
                            ))}
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                )}

                {/* Rows 13+: full unblurred list for subscribers */}
                {unlocked && filteredPlayers.length > FREE_ROWS && (
                  <tbody>
                    {filteredPlayers.slice(FREE_ROWS).map((player, i) => {
                      const rank = FREE_ROWS + i + 1;
                      const tierNum = getTierNumber(rank, activeTiers);
                      const prevTierNum = getTierNumber(rank - 1, activeTiers);
                      const showDivider = noFilters && tierNum !== prevTierNum;
                      const colSpan = 4 + (showCreatorColumns && activeCreator === "consensus" ? ACTIVE_CREATORS.length : 0);
                      return (
                        <Fragment key={player.name}>
                          {showDivider && (
                            <tr className="select-none pointer-events-none">
                              <td colSpan={colSpan} className="py-1.5 px-6">
                                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                                  <div className="h-px bg-blue-200" />
                                  <span className="text-xs font-semibold text-blue-600 tracking-wider uppercase">Tier {tierNum}</span>
                                  <div className="h-px bg-blue-200" />
                                </div>
                              </td>
                            </tr>
                          )}
                          <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 text-gray-400 font-mono text-sm">{rank}{(() => { const m = movementCache[activeFormat]?.[activeCreator]?.[player.name]; if (!m) return null; return <span className={`ml-1.5 text-xs font-semibold ${m > 0 ? "text-green-600" : "text-red-500"}`}>{m > 0 ? "▲" : "▼"}{Math.abs(m)}</span>; })()}</td>
                            <td className="px-6 py-4 font-medium">
                              <span onClick={() => openPlayerModal(player)} className="cursor-pointer hover:text-blue-600 transition-colors">
                                {player.name}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${posColors[player.pos] || "bg-gray-100 text-gray-600"}`}>
                                {displayPosRanks[player.name]}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-gray-500">{player.team}</td>
                            {showCreatorColumns && activeCreator === "consensus" && ACTIVE_CREATORS.map(c => (
                              <td key={c.id} className="px-6 py-4 text-xs font-mono text-gray-400">
                                {creatorPosRanks[c.id]?.[normalizeName(player.name)] || "—"}
                              </td>
                            ))}
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                )}
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
                  Subscribe to unlock — $10/mo
                </a>
              </div>
            )}
          </div>
        )}

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
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition-colors text-lg leading-none font-medium"
            >
              ✕
            </button>

            {/* Header */}
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-2xl font-bold text-[#0F172A] mb-2">{selectedPlayer.name}</h2>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-xs font-semibold ${posColors[selectedPlayer.pos] || "bg-gray-100 text-gray-600"}`}>
                  {displayPosRanks[selectedPlayer.name] || selectedPlayer.pos}
                </span>
                <span className="text-gray-500 text-sm">{selectedPlayer.team}</span>
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
