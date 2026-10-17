"use client";
import { useEffect, useMemo, useState } from "react";
import NavBar from "@/app/components/NavBar";
import PageTitle from "@/app/components/PageTitle";
import PlayerHeadshot from "@/app/components/PlayerHeadshot";
import StatsModeSlider from "@/app/components/StatsModeSlider";
import { MATCHUP_TIER_CLASSES } from "@/lib/matchupStrength";

const POSITIONS = ["All", "QB", "RB", "WR", "TE"];

export default function PlayersPage() {
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState([]);
  const [season, setSeason] = useState(null);
  const [position, setPosition] = useState("All");
  const [mode, setMode] = useState("avg"); // "avg" | "total" — avg is the default view
  const [nextMatchups, setNextMatchups] = useState({});
  const [matchupTiers, setMatchupTiers] = useState({});

  useEffect(() => {
    Promise.all([
      fetch("/api/players/stats").then((r) => (r.ok ? r.json() : { players: [] })),
      fetch("/api/matchup-strength").then((r) => (r.ok ? r.json() : { nextMatchups: {}, tiers: {} })),
    ])
      .then(([statsData, matchupData]) => {
        setPlayers(statsData.players || []);
        setSeason(statsData.season || null);
        setNextMatchups(matchupData.nextMatchups || {});
        setMatchupTiers(matchupData.tiers || {});
      })
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    const filtered = position === "All" ? players : players.filter((p) => p.position === position);
    const rankKey = mode === "avg" ? "avgRank" : "totalRank";
    return [...filtered].sort((a, b) => a[rankKey] - b[rankKey]);
  }, [players, position, mode]);

  return (
    <div className="min-h-screen flex flex-col lg:pl-56">
      <NavBar activePath="/players" />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        <div className="mb-6 text-center">
          <PageTitle title="Player Stats" subtitle={season ? `${season} Season · Full PPR` : "Full PPR"} />
        </div>

        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          <div className="flex gap-1.5 flex-wrap">
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
          <StatsModeSlider
            active={mode}
            leftValue="avg"
            rightValue="total"
            leftLabel="Avg PPG"
            rightLabel="Total"
            onChange={setMode}
          />
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="bg-card/60 backdrop-blur-md rounded-xl border border-card/70 shadow-lg px-6 py-12 text-center">
            <p className="text-gray-400 text-sm">No stats recorded yet this season.</p>
          </div>
        ) : (
          <div className="bg-card/60 backdrop-blur-md rounded-xl border border-card/70 shadow-lg overflow-hidden">
            <div className="grid grid-cols-[1.5rem_2.5rem_1fr_4.5rem_3rem_4.5rem] items-center gap-4 px-4 py-2.5 border-b border-gray-100/80 bg-card/40">
              <span />
              <span />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Player</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center">{mode === "avg" ? "Avg PPG" : "Total Pts"}</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center">GP</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Next</span>
            </div>

            <div className="divide-y divide-gray-100/60">
              {rows.map((p, i) => {
                const rank = mode === "avg" ? p.avgRank : p.totalRank;
                const points = mode === "avg" ? p.avgPoints : p.totalPoints;
                const matchup = nextMatchups[p.team];
                const tierInfo = matchup ? matchupTiers[matchup.opponent]?.[p.position] : null;
                return (
                  <div
                    key={p.id}
                    className={`grid grid-cols-[1.5rem_2.5rem_1fr_4.5rem_3rem_4.5rem] items-center gap-4 px-4 py-2.5 ${
                      i % 2 === 0 ? "bg-card/20" : ""
                    }`}
                  >
                    <span className="text-xs text-gray-400 font-mono text-right">{position === "All" ? i + 1 : ""}</span>
                    <PlayerHeadshot espnId={p.espn_id} sleeperId={p.sleeper_id} name={p.name} size="tableRow" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{p.name}</p>
                      <p className="text-xs text-gray-400">
                        <span className="font-bold text-[#2563EB]">{p.position}{rank}</span> · {p.team}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-ink tabular-nums text-center">{points.toFixed(1)}</span>
                    <span className="text-sm text-gray-400 tabular-nums text-center">{p.gamesPlayed}</span>
                    <span
                      className={`text-xs shrink-0 px-1.5 py-0.5 rounded text-right ${
                        matchup ? (MATCHUP_TIER_CLASSES[tierInfo?.tier] || "text-gray-400") : "text-gray-400"
                      }`}
                    >
                      {matchup ? `${matchup.homeAway === "home" ? "vs" : "@"} ${matchup.opponent}` : "BYE"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
