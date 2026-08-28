"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import PlayerHeadshot from "./PlayerHeadshot";

const FORMATS = ["Auction 1QB", "Auction SF"];

export default function AuctionRankingsEditor({ creatorId, creatorLabel }) {
  const [format, setFormat] = useState(FORMATS[0]);
  const [playerPool, setPlayerPool] = useState([]);
  const [rows, setRows] = useState([]); // [{ player_id, pct }] enriched with pool info at render time
  const [teamBuildDescription, setTeamBuildDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [search, setSearch] = useState("");
  const [token, setToken] = useState(null);

  useEffect(() => {
    async function loadPool() {
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
    }
    loadPool();
  }, []);

  useEffect(() => {
    if (!creatorId) return;
    setLoading(true);
    fetch(`/api/auction-rankings?creator_id=${encodeURIComponent(creatorId)}&format=${encodeURIComponent(format)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setRows(d?.players || []);
        setTeamBuildDescription(d?.teamBuildDescription || "");
        setSavedAt(d?.updatedAt || null);
      })
      .finally(() => setLoading(false));
  }, [creatorId, format]);

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

  function updatePct(index, value) {
    const next = [...rows];
    next[index] = { ...next[index], pct: value };
    setRows(next);
  }

  function removePlayer(index) {
    setRows(rows.filter((_, i) => i !== index));
  }

  function addPlayer(playerId) {
    setRows([...rows, { player_id: playerId, pct: null }]);
    setSearch("");
  }

  async function save() {
    if (!token || !creatorId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/auction-rankings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          creator_id: creatorId,
          format,
          players: rows.map((r) => ({ player_id: r.player_id, pct: r.pct === "" ? null : r.pct })),
          teamBuildDescription,
        }),
      });
      if (res.ok) setSavedAt(new Date().toISOString());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white/70 backdrop-blur-md rounded-xl border border-white/80 shadow-lg p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="font-bold text-[#0F172A]">Auction Rankings{creatorLabel ? ` — ${creatorLabel}` : ""}</h3>
          <p className="text-xs text-gray-400">% is share of a $200 budget. Order sets rank.</p>
        </div>
        <div className="flex gap-1.5">
          {FORMATS.map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                format === f ? "bg-[#2563EB] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5">
        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Team Build Description</label>
        <textarea
          value={teamBuildDescription}
          onChange={(e) => setTeamBuildDescription(e.target.value)}
          rows={4}
          placeholder="Explain your auction strategy for this format — budget allocation, positional priorities, when to pivot to value plays, etc."
          className="w-full bg-white rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-y"
        />
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
              className="w-full bg-white rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white rounded-lg border border-gray-200 shadow-xl max-h-64 overflow-y-auto">
                {searchResults.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addPlayer(p.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 text-left text-sm"
                  >
                    <span className="font-medium text-[#0F172A]">{p.name}</span>
                    <span className="text-xs text-gray-400">{p.position} · {p.team}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="max-h-[32rem] overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {rows.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No players on this board yet.</p>
            )}
            {rows.map((row, i) => {
              const p = byId[row.player_id];
              return (
                <div key={`${row.player_id}-${i}`} className="flex items-center gap-2.5 px-3 py-2">
                  <span className="text-xs text-gray-400 font-mono w-7 shrink-0 text-right">{i + 1}</span>
                  <PlayerHeadshot espnId={p?.espn_id} sleeperId={p?.sleeper_id} name={p?.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[#0F172A] truncate">{p?.name || `#${row.player_id}`}</p>
                    <p className="text-xs text-gray-400">{p?.position} · {p?.team}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={row.pct ?? ""}
                      onChange={(e) => updatePct(i, e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="—"
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
              {savedAt ? `Last saved ${new Date(savedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Not saved yet"}
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
