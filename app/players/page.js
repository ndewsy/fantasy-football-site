"use client";
import { useEffect, useMemo, useState } from "react";
import NavBar from "@/app/components/NavBar";
import PageTitle from "@/app/components/PageTitle";
import PlayerHeadshot from "@/app/components/PlayerHeadshot";

const POSITIONS = ["All", "QB", "RB", "WR", "TE"];
const SORT_COLUMNS = [
  { key: "totalPoints", label: "Total PPR" },
  { key: "avgPoints", label: "Avg PPR" },
  { key: "gamesPlayed", label: "GP" },
];

function SortArrow({ active, dir }) {
  if (!active) return null;
  return <span className="ml-1 text-[#2563EB]">{dir === "desc" ? "▼" : "▲"}</span>;
}

export default function PlayersPage() {
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState([]);
  const [season, setSeason] = useState(null);
  const [position, setPosition] = useState("All");
  const [sortKey, setSortKey] = useState("totalPoints");
  const [sortDir, setSortDir] = useState("desc");

  useEffect(() => {
    fetch("/api/players/stats")
      .then((r) => (r.ok ? r.json() : { players: [] }))
      .then((d) => {
        setPlayers(d.players || []);
        setSeason(d.season || null);
      })
      .finally(() => setLoading(false));
  }, []);

  function toggleSort(key) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const rows = useMemo(() => {
    const filtered = position === "All" ? players : players.filter((p) => p.position === position);
    const sorted = [...filtered].sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      return sortDir === "desc" ? -diff : diff;
    });
    return sorted;
  }, [players, position, sortKey, sortDir]);

  return (
    <div className="min-h-screen flex flex-col lg:pl-56">
      <NavBar activePath="/players" />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        <div className="mb-6 text-center">
          <PageTitle title="Player Stats" subtitle={season ? `${season} Season · Full PPR` : "Full PPR"} />
        </div>

        <div className="flex gap-1.5 mb-5 justify-center flex-wrap">
          {POSITIONS.map((p) => (
            <button
              key={p}
              onClick={() => setPosition(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                position === p ? "bg-[#2563EB] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="bg-card/60 backdrop-blur-md rounded-xl border border-card/70 shadow-lg px-6 py-12 text-center">
            <p className="text-gray-400 text-sm">No stats recorded yet this season.</p>
          </div>
        ) : (
          <div className="bg-card/60 backdrop-blur-md rounded-xl border border-card/70 shadow-lg overflow-hidden">
            <div className="grid grid-cols-[2.5rem_1fr_auto_auto_auto] items-center gap-3 px-4 py-2.5 border-b border-gray-100/80 bg-card/40">
              <span />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Player</span>
              {SORT_COLUMNS.map((col) => (
                <button
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className="text-[10px] font-bold text-gray-400 hover:text-gray-700 uppercase tracking-wider text-right flex items-center justify-end"
                >
                  {col.label}
                  <SortArrow active={sortKey === col.key} dir={sortDir} />
                </button>
              ))}
            </div>

            <div className="divide-y divide-gray-100/60">
              {rows.map((p, i) => (
                <div
                  key={p.id}
                  className={`grid grid-cols-[2.5rem_1fr_auto_auto_auto] items-center gap-3 px-4 py-2.5 ${
                    i % 2 === 0 ? "bg-card/20" : ""
                  }`}
                >
                  <PlayerHeadshot espnId={p.espn_id} sleeperId={p.sleeper_id} name={p.name} size="tableRow" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.position} · {p.team}</p>
                  </div>
                  <span className="text-sm font-bold text-ink tabular-nums text-right">{p.totalPoints.toFixed(1)}</span>
                  <span className="text-sm text-gray-500 tabular-nums text-right">{p.avgPoints.toFixed(1)}</span>
                  <span className="text-sm text-gray-400 tabular-nums text-right">{p.gamesPlayed}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
