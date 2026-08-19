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
        <p className="text-sm font-medium text-[#0F172A] truncate">{p.name}</p>
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

export default function AdpMovementWidget() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/api/rankings/adp-movement")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, []);

  const empty = data && !data.buildingData && data.risers.length === 0 && data.fallers.length === 0;

  return (
    <div className="bg-white/70 backdrop-blur-md rounded-xl border border-white/80 shadow-lg p-4">
      <h3 className="text-sm font-bold text-[#0F172A] mb-1">ADP Movers</h3>
      {!data ? (
        <p className="text-xs text-gray-400 py-4 text-center">Loading...</p>
      ) : data.buildingData || empty ? (
        <p className="text-xs text-gray-400 py-4 text-center">Building up ADP history — check back soon.</p>
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
