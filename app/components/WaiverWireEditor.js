"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { getCurrentWeekFromGames } from "@/lib/currentWeek";
import PlayerHeadshot from "./PlayerHeadshot";

const CATEGORIES = [
  { id: "priority", label: "Priority Adds" },
  { id: "drop", label: "Drop/Cut" },
  { id: "streamer", label: "Streamers" },
];
const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);

export default function WaiverWireEditor({ creatorId, creatorLabel }) {
  const [category, setCategory] = useState(CATEGORIES[0].id);
  const [week, setWeek] = useState(1);
  const [playerPool, setPlayerPool] = useState([]);
  const [rows, setRows] = useState([]); // [{ player_id, term, faab_pct }] enriched with pool info at render time
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [search, setSearch] = useState("");
  const [token, setToken] = useState(null);

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
        .select("week, status, kickoff_at")
        .order("kickoff_at", { ascending: true });
      setWeek(getCurrentWeekFromGames(games || []));
    }
    loadPoolAndWeek();
  }, []);

  useEffect(() => {
    if (!creatorId) return;
    setLoading(true);
    fetch(`/api/waiver-wire?creator_id=${encodeURIComponent(creatorId)}&week=${week}&category=${category}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const entries = (d?.entries || []).map((e) => ({ player_id: e.player_id, term: e.term, faab_pct: e.faab_pct }));
        setRows(entries);
        setSavedAt(null);
      })
      .finally(() => setLoading(false));
  }, [creatorId, week, category]);

  const byId = Object.fromEntries(playerPool.map((p) => [p.id, p]));
  const usedIds = new Set(rows.map((r) => r.player_id));
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

  function updateTerm(index, term) {
    const next = [...rows];
    next[index] = { ...next[index], term: next[index].term === term ? null : term };
    setRows(next);
  }

  function updateFaab(index, value) {
    const next = [...rows];
    next[index] = { ...next[index], faab_pct: value };
    setRows(next);
  }

  function removePlayer(index) {
    setRows(rows.filter((_, i) => i !== index));
  }

  function addPlayer(playerId) {
    setRows([...rows, { player_id: playerId, term: null, faab_pct: null }]);
    setSearch("");
  }

  async function save() {
    if (!token || !creatorId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/waiver-wire", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          creator_id: creatorId,
          week,
          category,
          entries: rows.map((r) => ({
            player_id: r.player_id,
            term: r.term || null,
            faab_pct: r.faab_pct === "" ? null : r.faab_pct,
          })),
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
          <h3 className="font-bold text-ink">Waiver Wire{creatorLabel ? ` — ${creatorLabel}` : ""}</h3>
          <p className="text-xs text-gray-400">Order sets priority. Term and FAAB % are optional per player.</p>
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
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              category === c.id ? "bg-[#2563EB] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {c.label}
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

          <div className="max-h-[32rem] overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {rows.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No players in this list yet.</p>
            )}
            {rows.map((row, i) => {
              const p = byId[row.player_id];
              return (
                <div key={`${row.player_id}-${i}`} className="flex items-center gap-2.5 px-3 py-2 flex-wrap sm:flex-nowrap">
                  <span className="text-xs text-gray-400 font-mono w-7 shrink-0 text-right">{i + 1}</span>
                  <PlayerHeadshot espnId={p?.espn_id} sleeperId={p?.sleeper_id} name={p?.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink truncate">{p?.name || `#${row.player_id}`}</p>
                    <p className="text-xs text-gray-400">{p?.position} · {p?.team}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => updateTerm(i, "short")}
                      className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                        row.term === "short" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      Short
                    </button>
                    <button
                      onClick={() => updateTerm(i, "long")}
                      className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                        row.term === "long" ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      Long
                    </button>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={row.faab_pct ?? ""}
                      onChange={(e) => updateFaab(i, e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="FAAB"
                      className="w-16 text-right bg-gray-50 rounded-md border border-gray-200 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-400">%</span>
                  </div>
                  <div className="flex flex-col shrink-0">
                    <button onClick={() => movePlayer(i, -1)} disabled={i === 0} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs leading-none px-1">▲</button>
                    <button onClick={() => movePlayer(i, 1)} disabled={i === rows.length - 1} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 text-xs leading-none px-1">▼</button>
                  </div>
                  <button onClick={() => removePlayer(i)} className="text-gray-300 hover:text-red-500 shrink-0 text-sm px-1">✕</button>
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
