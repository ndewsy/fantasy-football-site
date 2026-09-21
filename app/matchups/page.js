"use client";
import { useEffect, useState } from "react";
import NavBar from "@/app/components/NavBar";
import PageTitle from "@/app/components/PageTitle";
import PillToggle from "@/app/components/PillToggle";
import { MATCHUP_TIER_LABELS, MATCHUP_TIER_CLASSES } from "@/lib/matchupStrength";

const POSITIONS = ["QB", "RB", "WR", "TE"];

export default function MatchupsPage() {
  const [loading, setLoading] = useState(true);
  const [position, setPosition] = useState("QB");
  const [week, setWeek] = useState(null);
  const [weeksUsed, setWeeksUsed] = useState(0);
  const [stats, setStats] = useState({});
  const [nextMatchups, setNextMatchups] = useState({});

  useEffect(() => {
    fetch("/api/matchup-strength")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setStats(d?.stats || {});
        setWeek(d?.week ?? null);
        setWeeksUsed(d?.weeksUsed ?? 0);
        setNextMatchups(d?.nextMatchups || {});
      })
      .finally(() => setLoading(false));
  }, []);

  const rows = stats[position] || [];

  return (
    <div className="min-h-screen flex flex-col lg:pl-56">
      <NavBar activePath="/matchups" />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">
        <div className="mb-6 text-center">
          <PageTitle title="Strength of Matchup" />
          <p className="text-gray-500 text-sm mt-0.5">
            {week != null
              ? `Week ${week} ratings, built from ${weeksUsed} week${weeksUsed === 1 ? "" : "s"} of actual game stats.`
              : "Defense-vs-Position ratings for the upcoming week."}
          </p>
          <p className="text-gray-400 text-xs mt-0.5">Resets Tuesday morning to the new week.</p>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="bg-card/60 backdrop-blur-md rounded-xl border border-card/70 shadow-lg px-6 py-12 text-center">
            <h2 className="text-lg font-bold text-ink mb-2">Not enough data yet</h2>
            <p className="text-gray-400 text-sm max-w-sm mx-auto">
              Matchup ratings need at least one completed week of games before there's anything to rank.
            </p>
          </div>
        ) : (
          <>
            <PillToggle options={POSITIONS} value={position} onChange={setPosition} className="mb-5" />

            <div className="flex flex-wrap items-center gap-2 justify-center mb-5">
              {Object.entries(MATCHUP_TIER_LABELS).map(([tier, label]) => (
                <span key={tier} className={`inline-flex items-center justify-center w-24 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded ${MATCHUP_TIER_CLASSES[tier]}`}>
                  {label}
                </span>
              ))}
            </div>

            <div className="bg-card/60 backdrop-blur-md rounded-xl border border-card/70 shadow-lg overflow-hidden">
              <div className="grid grid-cols-[2.5rem_1fr_4rem_6rem_3.5rem_3.5rem_3.5rem] items-center gap-3 px-4 py-2.5 border-b border-gray-100/80 bg-card/40">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Rank</span>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Team</span>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Next</span>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center">Grade</span>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Avg</span>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">High</span>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Low</span>
              </div>

              <div className="divide-y divide-gray-100/60">
                {rows.map((row, i) => {
                  const next = nextMatchups[row.team];
                  return (
                    <div
                      key={row.team}
                      className={`grid grid-cols-[2.5rem_1fr_4rem_6rem_3.5rem_3.5rem_3.5rem] items-center gap-3 px-4 py-3 ${i % 2 === 0 ? "bg-card/20" : ""}`}
                    >
                      <span className="text-sm text-gray-400 font-mono">{row.rank}</span>
                      <span className="text-sm font-semibold text-ink">{row.team}</span>
                      <span className="text-xs text-gray-400">
                        {next ? `${next.homeAway === "home" ? "vs" : "@"} ${next.opponent}` : "BYE"}
                      </span>
                      <span className={`inline-flex items-center justify-center w-24 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded ${MATCHUP_TIER_CLASSES[row.tier]}`}>
                        {MATCHUP_TIER_LABELS[row.tier]}
                      </span>
                      <span className="text-sm font-bold text-ink tabular-nums text-right">{row.avgAllowed.toFixed(1)}</span>
                      <span className="text-sm text-gray-400 tabular-nums text-right">{row.high.toFixed(1)}</span>
                      <span className="text-sm text-gray-400 tabular-nums text-right">{row.low.toFixed(1)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-[11px] text-gray-400 mt-3 text-center">
              Avg/High/Low are fantasy points (PPR) allowed to {position} per game this season, ranked highest-allowed (easiest) to lowest-allowed (hardest).
            </p>
          </>
        )}
      </main>
    </div>
  );
}
