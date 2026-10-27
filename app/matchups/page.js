"use client";
import { useEffect, useState } from "react";
import NavBar from "@/app/components/NavBar";
import PageTitle from "@/app/components/PageTitle";
import PillToggle from "@/app/components/PillToggle";
import { MATCHUP_TIER_LABELS, MATCHUP_TIER_CLASSES, NOTABLE_MIN_POINTS } from "@/lib/matchupStrength";

const POSITIONS = ["QB", "RB", "WR", "TE"];

export default function MatchupsPage() {
  const [loading, setLoading] = useState(true);
  const [position, setPosition] = useState("QB");
  const [week, setWeek] = useState(null);
  const [weeksUsed, setWeeksUsed] = useState(0);
  const [stats, setStats] = useState({});
  const [nextMatchups, setNextMatchups] = useState({});
  const [history, setHistory] = useState({});
  const [expandedTeam, setExpandedTeam] = useState(null);

  useEffect(() => {
    fetch("/api/matchup-strength")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setStats(d?.stats || {});
        setWeek(d?.week ?? null);
        setWeeksUsed(d?.weeksUsed ?? 0);
        setNextMatchups(d?.nextMatchups || {});
        setHistory(d?.history || {});
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
            <PillToggle options={POSITIONS} value={position} onChange={(p) => { setPosition(p); setExpandedTeam(null); }} className="mb-5" />

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
                  const expanded = expandedTeam === row.team;
                  const weeks = history[position]?.[row.team] || [];
                  return (
                    <div key={row.team} className={i % 2 === 0 ? "bg-card/20" : ""}>
                    <button
                      type="button"
                      onClick={() => setExpandedTeam(expanded ? null : row.team)}
                      aria-expanded={expanded}
                      className="w-full text-left grid grid-cols-[2.5rem_1fr_4rem_6rem_3.5rem_3.5rem_3.5rem] items-center gap-3 px-4 py-3 cursor-pointer hover:bg-card/40 transition-colors"
                    >
                      <span className="text-sm text-gray-400 font-mono">{row.rank}</span>
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                        <svg viewBox="0 0 20 20" fill="currentColor" className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-300 ${expanded ? "rotate-90" : ""}`} aria-hidden="true">
                          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
                        </svg>
                        {row.team}
                      </span>
                      <span className="text-xs text-gray-400">
                        {next ? `${next.homeAway === "home" ? "vs" : "@"} ${next.opponent}` : "BYE"}
                      </span>
                      <span className={`inline-flex items-center justify-center w-24 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded ${MATCHUP_TIER_CLASSES[row.tier]}`}>
                        {MATCHUP_TIER_LABELS[row.tier]}
                      </span>
                      <span className="text-sm font-bold text-ink tabular-nums text-right">{row.avgAllowed.toFixed(1)}</span>
                      <span className="text-sm text-gray-400 tabular-nums text-right">{row.high.toFixed(1)}</span>
                      <span className="text-sm text-gray-400 tabular-nums text-right">{row.low.toFixed(1)}</span>
                    </button>
                    {/* Always rendered so the open/close can animate — the
                        0fr -> 1fr grid-row trick transitions to the content's
                        natural height without measuring it. */}
                    <div
                      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                      aria-hidden={!expanded}
                    >
                    <div className="overflow-hidden">
                      <div className="px-4 pb-4 pt-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                          {position === "QB" ? "Starting QBs vs" : `Notable ${position}s vs`} {row.team}
                        </p>
                        {weeks.length === 0 ? (
                          <p className="text-xs text-gray-400">No games yet.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {weeks.map((w) => (
                              <div key={w.week} className="grid grid-cols-[3rem_3rem_1fr] items-start gap-3 text-sm">
                                <span className="text-xs text-gray-400 font-mono pt-0.5">WK {w.week}</span>
                                <span className="text-xs font-semibold text-gray-500 pt-0.5">{w.offense || ""}</span>
                                <div className="space-y-0.5">
                                  {w.players.map((p, j) => (
                                    <div key={j} className="flex items-center justify-between gap-3">
                                      <span className="text-ink truncate">{p.name}</span>
                                      <span className="flex items-center gap-2 shrink-0">
                                        <span className="text-[10px] text-gray-400 font-mono">{position}{p.finish}</span>
                                        <span className={`inline-flex justify-center w-12 text-xs font-bold tabular-nums px-1.5 py-0.5 rounded ${MATCHUP_TIER_CLASSES[p.tier]}`}>
                                          {p.points.toFixed(1)}
                                        </span>
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="text-[10px] text-gray-400 mt-2">
                          {position !== "QB" && <>Shows {NOTABLE_MIN_POINTS}+ PPR games, plus each week&apos;s top scorer. </>}
                          Colored by where the game finished among all {position}s that week.
                        </p>
                      </div>
                    </div>
                    </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-[11px] text-gray-400 mt-3 text-center">
              Avg/High/Low are fantasy points (PPR) allowed to {position} per game this season, ranked highest-allowed (easiest) to lowest-allowed (hardest). Tap a team to see who scored against them.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
