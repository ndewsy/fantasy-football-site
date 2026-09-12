"use client";
import { useEffect, useState } from "react";
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
  const [showAddTier, setShowAddTier] = useState(false);
  const [addTierRank, setAddTierRank] = useState("");
  const [addTierError, setAddTierError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [search, setSearch] = useState("");
  const [token, setToken] = useState(null);
  const [seasonGames, setSeasonGames] = useState([]);

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
  const searchResults = search.trim().length >= 2
    ? playerPool.filter((p) => !usedIds.has(p.id) && p.name.toLowerCase().includes(search.toLowerCase().trim())).slice(0, 10)
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

  function confirmAddTier() {
    const pos = parseInt(addTierRank, 10);
    if (!Number.isInteger(pos) || pos < 1) {
      setAddTierError("Please enter a positive whole number.");
      return;
    }
    if (pos >= rows.length) {
      setAddTierError(`Must be less than ${rows.length} (your total ranked players).`);
      return;
    }
    const newTierStart = pos + 1;
    if (tiers.includes(newTierStart)) {
      setAddTierError(`A tier boundary already exists after rank ${pos}.`);
      return;
    }
    setTiers([...tiers, newTierStart].sort((a, b) => a - b));
    setShowAddTier(false);
    setAddTierRank("");
    setAddTierError("");
  }

  function removeTier(tierIndex) {
    const next = [...tiers];
    next.splice(tierIndex, 1);
    setTiers(next);
  }

  async function save() {
    if (!token || !creatorId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/weekly-rankings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          creator_id: creatorId,
          week,
          position,
          entries: rows.map((r) => ({ player_id: r.player_id })),
          tiers,
        }),
      });
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

          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-400">Tiers group players visually on the public page.</p>
            <button
              onClick={() => { setShowAddTier(true); setAddTierRank(""); setAddTierError(""); }}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              + Add Tier
            </button>
          </div>
          {showAddTier && (
            <div className="flex items-center gap-2 mb-3 bg-gray-50 border border-gray-200 rounded-lg p-2.5">
              <span className="text-xs text-gray-500 shrink-0">New tier starts after rank</span>
              <input
                type="number"
                min="1"
                value={addTierRank}
                onChange={(e) => setAddTierRank(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmAddTier()}
                autoFocus
                className="w-16 bg-card rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={confirmAddTier} className="text-xs font-semibold bg-blue-600 text-white px-2.5 py-1 rounded">Add</button>
              <button onClick={() => setShowAddTier(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
              {addTierError && <p className="text-[11px] text-red-500 ml-1">{addTierError}</p>}
            </div>
          )}

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
                <div key={`${row.player_id}-${i}`}>
                {showDivider && (
                  <div className="flex items-center gap-3 px-3 py-1.5 bg-blue-50">
                    <div className="flex-1 h-px bg-blue-200" />
                    <span className="text-[11px] font-semibold text-blue-600 tracking-wider uppercase">Tier {tierNum}</span>
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
                )}
                <div className="flex items-center gap-2.5 px-3 py-2 flex-wrap sm:flex-nowrap">
                  <span className="text-xs text-gray-400 font-mono w-7 shrink-0 text-right">{i + 1}</span>
                  <PlayerHeadshot espnId={p?.espn_id} sleeperId={p?.sleeper_id} name={p?.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink truncate">{p?.name || `#${row.player_id}`}</p>
                    <p className="text-xs text-gray-400">{p?.position} · {p?.team}</p>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
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
