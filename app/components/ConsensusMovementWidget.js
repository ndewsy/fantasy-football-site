"use client";
import { useEffect, useState } from "react";
import PlayerHeadshot from "./PlayerHeadshot";

const posColors = {
  WR: "bg-blue-100 text-blue-700",
  RB: "bg-green-100 text-green-700",
  QB: "bg-red-100 text-red-700",
  TE: "bg-amber-100 text-amber-700",
};

function MovementRow({ m, direction }) {
  const p = m.player;
  return (
    <div className="flex items-center gap-2.5 py-2">
      <PlayerHeadshot espnId={p.espn_id} sleeperId={p.sleeper_id} name={p.name} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink truncate">{p.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${posColors[p.position] || "bg-gray-100 text-gray-600"}`}>
            {p.position}
          </span>
          <span className="text-xs text-gray-400">{p.team}</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs text-gray-400 font-mono">{m.before} → {m.after}</p>
        <p className={`text-xs font-semibold ${direction === "up" ? "text-green-600" : "text-red-500"}`}>
          {direction === "up" ? "▲" : "▼"} {Math.abs(m.delta)}
        </p>
      </div>
    </div>
  );
}

export default function ConsensusMovementWidget({ format }) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch(`/api/rankings/consensus-movement?format=${encodeURIComponent(format)}&days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((result) => setData(result ? { ...result, format, days } : null))
      .catch(() => setData(null));
  }, [format, days]);

  // Ignore stale data left over from the previous format/window while the new fetch is in flight.
  const loaded = data && data.format === format && data.days === days;
  const empty = loaded && !data.buildingData && data.risers.length === 0 && data.fallers.length === 0;

  return (
    <div className="bg-card/70 backdrop-blur-md rounded-xl border border-card/80 shadow-lg p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-ink">Consensus Movers</h3>
        <div className="flex items-center gap-1 shrink-0">
          {[7, 14].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                days === d
                  ? "bg-[#2563EB] text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {d}D
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-gray-400 mb-2">{format} · last {days} days</p>
      {!loaded ? (
        <p className="text-xs text-gray-400 py-4 text-center">Loading...</p>
      ) : data.buildingData || empty ? (
        <p className="text-xs text-gray-400 py-4 text-center">Building up rankings history — check back soon.</p>
      ) : (
        <>
          {data.risers.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] font-semibold text-green-600 uppercase tracking-wider mb-1">Risers</p>
              <div className="divide-y divide-gray-100">
                {data.risers.map((m) => (
                  <MovementRow key={m.player.id} m={m} direction="up" />
                ))}
              </div>
            </div>
          )}
          {data.fallers.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider mb-1">Fallers</p>
              <div className="divide-y divide-gray-100">
                {data.fallers.map((m) => (
                  <MovementRow key={m.player.id} m={m} direction="down" />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
