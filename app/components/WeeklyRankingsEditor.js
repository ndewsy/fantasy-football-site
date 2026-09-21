"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import { getCurrentWeekFromGames } from "@/lib/currentWeek";
import PlayerHeadshot from "./PlayerHeadshot";

const POSITIONS = [
  { id: "QB", label: "QB" },
  { id: "RB", label: "RB" },
  { id: "WR", label: "WR" },
  { id: "TE", label: "TE" },
  { id: "DST", label: "DST" },
  { id: "K", label: "K" },
];
const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);
const RECOMMENDED_LIMIT = 24;
// Start/Sit projections only cover skill positions with prop markets —
// DST/K have no player_prop_lines, so there's nothing to recommend there.
const RECOMMENDED_POSITIONS = new Set(["QB", "RB", "WR", "TE"]);
const MATCHUP_TIER_CLASSES = {
  red: "bg-red-100 text-red-600",
  yellow: "bg-amber-100 text-amber-600",
  green: "bg-green-100 text-green-600",
};

// tiers is a sorted array of rank thresholds where a new tier starts —
// tiers[0] is always 1 (implicit, not user-removable), same model as the
// main Redraft/Dynasty rankings' tiers.
function getTierNumber(rank, tiers) {
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (rank >= tiers[i]) return i + 1;
  }
  return 1;
}

export default function WeeklyRankingsEditor({ creatorId, creatorLabel }) {
  const [position, setPosition] = useState(POSITIONS[0].id);
  const [week, setWeek] = useState(1);
  const [playerPool, setPlayerPool] = useState([]);
  const [rows, setRows] = useState([]); // [{ player_id }] enriched with pool info at render time
  const [tiers, setTiers] = useState([1]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSavedAt, setNoteSavedAt] = useState(null);
  const [search, setSearch] = useState("");
  const [token, setToken] = useState(null);
  const [seasonGames, setSeasonGames] = useState([]);
  const [matchupTiers, setMatchupTiers] = useState({});
  const [recommended, setRecommended] = useState([]);
  const [recommendedWeek, setRecommendedWeek] = useState(null);
  const [recommendedLoading, setRecommendedLoading] = useState(false);
  const [showRecommended, setShowRecommended] = useState(false);
  const dragIndex = useRef(null);
  const dragTierRank = useRef(null);

  useEffect(() => {
    async function loadPoolAndWeek() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      setToken(session?.access_token || null);

      const all = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data } = await supabase
          .from("players")
          .select("id, name, position, team, sleeper_id, espn_id")
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        all.push(...(data || []));
        if (!data || data.length < PAGE) break;
      }
      setPlayerPool(all);

      const { data: games } = await supabase
        .from("season_games")
        .select("week, status, kickoff_at, home_team, away_team")
        .order("kickoff_at", { ascending: true });
      setSeasonGames(games || []);
      setWeek(getCurrentWeekFromGames(games || []));
    }
    loadPoolAndWeek();

    // Season-wide, not week/position-scoped — one fetch covers every tab.
    fetch("/api/weekly-rankings/matchup-strength")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMatchupTiers(d?.tiers || {}))
      .catch(() => setMatchupTiers({}));
  }, []);

  useEffect(() => {
    if (!creatorId) return;
    setLoading(true);
    fetch(`/api/weekly-rankings?creator_id=${encodeURIComponent(creatorId)}&week=${week}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const entries = (d?.positions?.[position] || []).map((e) => ({ player_id: e.player_id }));
        setRows(entries);
        const savedTiers = d?.tiers?.[position];
        setTiers(savedTiers && savedTiers.length > 0 ? savedTiers : [1]);
        setSavedAt(null);
      })
      .finally(() => setLoading(false));
  }, [creatorId, week, position]);

  // Projections only exist for skill positions (no prop markets for DST/K) —
  // skip the fetch there and just show the empty state.
  useEffect(() => {
    if (!RECOMMENDED_POSITIONS.has(position)) {
      setRecommended([]);
      return;
    }
    setRecommendedLoading(true);
    fetch(`/api/weekly-rankings/recommended?position=${position}&limit=${RECOMMENDED_LIMIT}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setRecommended(d?.topStarts || []); setRecommendedWeek(d?.week ?? null); })
      .catch(() => setRecommended([]))
      .finally(() => setRecommendedLoading(false));
  }, [position]);

  // Week-level, not per-position — reload only when creator/week changes so
  // switching position tabs doesn't clobber an unsaved disclaimer edit.
  useEffect(() => {
    if (!creatorId) return;
    fetch(`/api/weekly-rankings/note?creator_id=${encodeURIComponent(creatorId)}&week=${week}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setNote(d?.note || ""))
      .catch(() => setNote(""))
      .finally(() => setNoteSavedAt(null));
  }, [creatorId, week]);

  const byId = Object.fromEntries(playerPool.map((p) => [p.id, p]));
  const usedIds = new Set(rows.map((r) => r.player_id));
  // team -> { opponent, homeAway } for the selected week — BYE if no game.
  const matchups = Object.fromEntries(
    seasonGames
      .filter((g) => g.week === week)
      .flatMap((g) => [
        [g.home_team, { opponent: g.away_team, homeAway: "home" }],
        [g.away_team, { opponent: g.home_team, homeAway: "away" }],
      ])
  );
  // Recommended is always for whichever week Sleeper just projected (see
  // /api/weekly-rankings/recommended), which can differ from the week
  // selected above — keyed off recommendedWeek rather than reusing matchups.
  const recommendedMatchups = Object.fromEntries(
    seasonGames
      .filter((g) => g.week === recommendedWeek)
      .flatMap((g) => [
        [g.home_team, { opponent: g.away_team, homeAway: "home" }],
        [g.away_team, { opponent: g.home_team, homeAway: "away" }],
      ])
  );
  const searchResults = search.trim().length >= 2
    ? playerPool.filter((p) => p.position === position && !usedIds.has(p.id) && p.name.toLowerCase().includes(search.toLowerCase().trim())).slice(0, 10)
    : [];

  function movePlayer(index, dir) {
    const next = [...rows];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setRows(next);
  }

  function removePlayer(index) {
    setRows(rows.filter((_, i) => i !== index));
  }

  function addPlayer(playerId) {
    setRows([...rows, { player_id: playerId }]);
    setSearch("");
  }

  // rank is 1-indexed; a break "before rank" makes that player the first of
  // a new tier. Rank 1 already implicitly starts tier 1, so it's a no-op.
  function addTierBreakBeforeRank(rank) {
    if (rank <= 1 || tiers.includes(rank)) return;
    setTiers([...tiers, rank].sort((a, b) => a - b));
  }

  function removeTier(tierIndex) {
    const next = [...tiers];
    next.splice(tierIndex, 1);
    setTiers(next);
  }

  // Standalone save for just the disclaimer — it's week-level, not tied to
  // any one position's list, so a creator jotting a note shouldn't have to
  // scroll past the full player list to the main Save button below to post it.
  async function saveNote() {
    if (!token || !creatorId) return;
    setNoteSaving(true);
    try {
      const res = await fetch("/api/weekly-rankings/note", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ creator_id: creatorId, week, note }),
      });
      if (res.ok) setNoteSavedAt(new Date().toISOString());
    } finally {
      setNoteSaving(false);
    }
  }

  // Native HTML5 drag-and-drop, same pattern as the main rankings editor
  // (app/dashboard/page.js) — reorders rows live as you drag over them;
  // the existing Save button below persists it, same as the ▲/▼ buttons.
  function handleDragStart(e, index) {
    dragIndex.current = index;
    dragTierRank.current = null;
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e, index) {
    e.preventDefault();
    if (dragTierRank.current !== null) {
      // Same live-update approach as the row reorder below — move the
      // dragged boundary to sit right before whichever row is under the
      // pointer, unless that would collide with rank 1 or another boundary.
      const targetRank = index + 1;
      if (targetRank === 1 || targetRank === dragTierRank.current || tiers.includes(targetRank)) return;
      const next = tiers.map((t) => (t === dragTierRank.current ? targetRank : t)).sort((a, b) => a - b);
      dragTierRank.current = targetRank;
      setTiers(next);
      return;
    }
    if (dragIndex.current === null || dragIndex.current === index) return;
    // Splice synchronously here (not inside the setRows updater) — the
    // updater callback can run after this function returns, by which point
    // dragIndex.current would already hold the reassignment below, splicing
    // with the wrong (new) index instead of the one actually dragged from.
    const next = [...rows];
    const [dragged] = next.splice(dragIndex.current, 1);
    next.splice(index, 0, dragged);
    dragIndex.current = index;
    setRows(next);
  }

  function handleTierDragStart(e, rank) {
    e.stopPropagation();
    dragTierRank.current = rank;
    dragIndex.current = null;
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragEnd() {
    dragIndex.current = null;
    dragTierRank.current = null;
  }

  async function save() {
    if (!token || !creatorId) return;
    setSaving(true);
    try {
      const [res] = await Promise.all([
        fetch("/api/weekly-rankings", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            creator_id: creatorId,
            week,
            position,
            entries: rows.map((r) => ({ player_id: r.player_id })),
            tiers,
          }),
        }),
        fetch("/api/weekly-rankings/note", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ creator_id: creatorId, week, note }),
        }),
      ]);
      if (res.ok) setSavedAt(new Date().toISOString());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-card/70 backdrop-blur-md rounded-xl border border-card/80 shadow-lg p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="font-bold text-ink">Weekly Rankings{creatorLabel ? ` — ${creatorLabel}` : ""}</h3>
          <p className="text-xs text-gray-400">Order sets rank within each position. The previous week stays archived once a new one starts.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500">Week:</label>
          <select
            value={week}
            onChange={(e) => setWeek(Number(e.target.value))}
            className="bg-card rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500"
          >
            {WEEKS.map((w) => (
              <option key={w} value={w}>Week {w}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-5">
        <label className="block text-xs font-semibold text-gray-500 mb-1.5">
          Disclaimer for Week {week} <span className="font-normal text-gray-400">(optional — shown to everyone, applies to all positions this week)</span>
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="e.g. TEN and GB on bye. Justin Jefferson excluded — his game had already started when these were posted."
          className="w-full bg-card rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <div className="flex items-center justify-end gap-2 mt-1.5">
          <p className="text-xs text-gray-400">
            {noteSavedAt ? `Saved ${new Date(noteSavedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}
          </p>
          <button
            onClick={saveNote}
            disabled={noteSaving}
            className="bg-gray-100 hover:bg-gray-200 disabled:opacity-50 text-gray-600 font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors"
          >
            {noteSaving ? "Saving..." : "Save Disclaimer"}
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 mb-5">
        {POSITIONS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPosition(p.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              position === p.id ? "bg-[#2563EB] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-8">Loading...</p>
      ) : (
        <>
          <div className="relative mb-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Add a player..."
              className="w-full bg-card rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-card rounded-lg border border-gray-200 shadow-xl max-h-64 overflow-y-auto">
                {searchResults.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addPlayer(p.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 text-left text-sm"
                  >
                    <span className="font-medium text-ink">{p.name}</span>
                    <span className="text-xs text-gray-400">{p.position} · {p.team}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mb-3">
            <button
              onClick={() => setShowRecommended((v) => !v)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              {showRecommended ? "Hide" : "Show"} Top {RECOMMENDED_LIMIT} Recommended {position}s
            </button>
            {showRecommended && (
              <div className="mt-2 max-h-64 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
                {!RECOMMENDED_POSITIONS.has(position) && (
                  <p className="text-xs text-gray-400 text-center py-4">No projections available for {position}.</p>
                )}
                {RECOMMENDED_POSITIONS.has(position) && recommendedLoading && (
                  <p className="text-xs text-gray-400 text-center py-4">Loading...</p>
                )}
                {RECOMMENDED_POSITIONS.has(position) && !recommendedLoading && recommended.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">No upcoming projections for {position}.</p>
                )}
                {recommended
                  .filter((r) => !usedIds.has(r.player.id))
                  .map((r, i) => {
                    const matchup = recommendedMatchups[r.player.team];
                    return (
                      <button
                        key={r.player.id}
                        onClick={() => addPlayer(r.player.id)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 text-left text-sm"
                      >
                        <span className="text-xs text-gray-400 font-mono w-5 shrink-0 text-right">{i + 1}</span>
                        <span className="font-medium text-ink flex-1 truncate">{r.player.name}</span>
                        <span className="text-xs text-gray-400 shrink-0">{r.player.team}</span>
                        <span className={`text-xs shrink-0 w-16 text-right px-1.5 py-0.5 rounded ${matchup ? (MATCHUP_TIER_CLASSES[matchupTiers[matchup.opponent]?.[position]] || "text-gray-400") : "text-gray-400"}`}>
                          {matchup ? `${matchup.homeAway === "home" ? "vs" : "@"} ${matchup.opponent}` : "BYE"}
                        </span>
                        <span className="text-xs text-gray-400 shrink-0 w-14 text-right">{r.projectedPoints.toFixed(1)} pts</span>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>

          <p className="text-xs text-gray-400 mb-2">
            Tiers group players visually on the public page. Hover between players to add a break, or drag a tier's ⠿ handle to move it.
          </p>

          <div className="max-h-[32rem] overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {rows.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No players ranked yet.</p>
            )}
            {rows.map((row, i) => {
              const rank = i + 1;
              const tierNum = getTierNumber(rank, tiers);
              const prevTierNum = i > 0 ? getTierNumber(rank - 1, tiers) : tierNum;
              const showDivider = i === 0 || tierNum !== prevTierNum;
              const p = byId[row.player_id];
              const matchup = matchups[p?.team];
              return (
                <div key={`${row.player_id}-${i}`} className="group relative">
                {showDivider ? (
                  <div
                    draggable={tierNum > 1}
                    onDragStart={tierNum > 1 ? (e) => handleTierDragStart(e, rank) : undefined}
                    onDragOver={(e) => handleDragOver(e, i)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-3 px-3 py-1.5 bg-blue-50 ${tierNum > 1 ? "cursor-grab active:cursor-grabbing" : ""}`}
                  >
                    <div className="flex-1 h-px bg-blue-200" />
                    {tierNum > 1 && <span className="text-blue-300 select-none" title="Drag to move this tier break">⠿</span>}
                    <span className="text-[11px] font-semibold text-blue-600 tracking-wider uppercase select-none">Tier {tierNum}</span>
                    {tierNum > 1 && (
                      <button
                        onClick={() => removeTier(tiers.indexOf(rank))}
                        className="text-[11px] text-blue-400 hover:text-red-500"
                        title="Remove this tier break"
                      >
                        ✕
                      </button>
                    )}
                    <div className="flex-1 h-px bg-blue-200" />
                  </div>
                ) : rank > 1 && (
                  <button
                    onClick={() => addTierBreakBeforeRank(rank)}
                    title={`Add a tier break before rank ${rank}`}
                    className="w-full h-0 group-hover:h-5 overflow-hidden transition-[height] flex items-center justify-center bg-blue-50 hover:bg-blue-100 text-[10px] font-semibold text-blue-500 uppercase tracking-wide"
                  >
                    + Tier
                  </button>
                )}
                <div
                  draggable
                  onDragStart={(e) => handleDragStart(e, i)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDragEnd={handleDragEnd}
                  className="flex items-center gap-2.5 px-3 py-2 flex-wrap sm:flex-nowrap cursor-grab active:cursor-grabbing"
                >
                  <span className="text-gray-300 shrink-0 select-none" title="Drag to reorder">⠿</span>
                  <span className="text-xs text-gray-400 font-mono w-7 shrink-0 text-right">{i + 1}</span>
                  <PlayerHeadshot espnId={p?.espn_id} sleeperId={p?.sleeper_id} name={p?.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink truncate">{p?.name || `#${row.player_id}`}</p>
                    <p className="text-xs text-gray-400">{p?.position} · {p?.team}</p>
                  </div>
                  <span className={`text-xs shrink-0 px-1.5 py-0.5 rounded ${matchup ? (MATCHUP_TIER_CLASSES[matchupTiers[matchup.opponent]?.[position]] || "text-gray-400") : "text-gray-400"}`}>
                    {matchup ? `${matchup.homeAway === "home" ? "vs" : "@"} ${matchup.opponent}` : "BYE"}
                  </span>
                  <div className="flex flex-col shrink-0">
                    <button onClick={() => movePlayer(i, -1)} disabled={i === 0} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs leading-none px-1">▲</button>
                    <button onClick={() => movePlayer(i, 1)} disabled={i === rows.length - 1} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs leading-none px-1">▼</button>
                  </div>
                  <button onClick={() => removePlayer(i)} className="text-gray-300 hover:text-red-500 shrink-0 text-sm px-1">✕</button>
                </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-gray-400">
              {savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : "Not saved yet"}
            </p>
            <button
              onClick={save}
              disabled={saving}
              className="bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 disabled:opacity-50 text-white font-bold px-5 py-2 rounded-lg text-sm transition-all"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
