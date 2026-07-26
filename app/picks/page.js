"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import NavBar from "@/app/components/NavBar";

const TEAM_NAMES = {
  BUF: 'Bills',   MIA: 'Dolphins', NE: 'Patriots',  NYJ: 'Jets',
  BAL: 'Ravens',  CIN: 'Bengals',  CLE: 'Browns',   PIT: 'Steelers',
  HOU: 'Texans',  IND: 'Colts',    JAX: 'Jaguars',  TEN: 'Titans',
  DEN: 'Broncos', KC: 'Chiefs',    LV: 'Raiders',   LAC: 'Chargers',
  DAL: 'Cowboys', NYG: 'Giants',   PHI: 'Eagles',   WAS: 'Commanders',
  CHI: 'Bears',   DET: 'Lions',    GB: 'Packers',   MIN: 'Vikings',
  ATL: 'Falcons', CAR: 'Panthers', NO: 'Saints',    TB: 'Buccaneers',
  ARI: 'Cardinals', LAR: 'Rams',   SF: '49ers',     SEA: 'Seahawks',
};

function fmt(abbr) {
  return `${abbr} ${TEAM_NAMES[abbr] ?? ''}`.trim();
}

function kickoffLabel(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    timeZone: 'America/New_York',
  });
}

export default function PicksPage() {
  const [user, setUser]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [games, setGames]           = useState([]);
  const [picks, setPicks]           = useState({});
  const [activeWeek, setActiveWeek] = useState(1);
  const [submitting, setSubmitting] = useState(null);
  const [seasonLocked, setSeasonLocked] = useState(false);
  const weekTabsRef = useRef(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) { window.location.href = '/login'; return; }
      setUser(u);

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/picks', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) { setLoading(false); return; }

      const { games: g, picks: p } = await res.json();
      setGames(g ?? []);

      const map = {};
      for (const pk of (p ?? [])) map[pk.game_id] = pk.pick;
      setPicks(map);

      // Check lock: season starts at the earliest week-1 kickoff
      const w1 = (g ?? []).filter(x => x.week === 1 && x.kickoff_at);
      if (w1.length > 0) {
        const earliest = Math.min(...w1.map(x => new Date(x.kickoff_at).getTime()));
        if (earliest <= Date.now()) setSeasonLocked(true);
      }

      // Default to the most relevant week
      const now = Date.now();
      const inProgress = (g ?? []).find(x => x.status === 'in_progress');
      if (inProgress) {
        setActiveWeek(inProgress.week);
      } else {
        const upcoming = (g ?? []).find(x => x.kickoff_at && new Date(x.kickoff_at).getTime() > now);
        if (upcoming) setActiveWeek(upcoming.week);
      }

      setLoading(false);
    }
    load();
  }, []);

  async function submitPick(gameId, side) {
    if (seasonLocked || submitting) return;
    const prev = picks[gameId];
    setPicks(p => ({ ...p, [gameId]: side }));
    setSubmitting(gameId);

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/picks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ game_id: gameId, pick: side }),
    });

    if (!res.ok) {
      setPicks(p => ({ ...p, [gameId]: prev }));
      const { error } = await res.json().catch(() => ({}));
      if (error?.includes('locked')) setSeasonLocked(true);
    }
    setSubmitting(null);
  }

  const weeks = [...new Set(games.map(g => g.week))].sort((a, b) => a - b);
  const weekGames = games.filter(g => g.week === activeWeek).sort((a, b) => {
    const ta = a.kickoff_at ? new Date(a.kickoff_at).getTime() : Infinity;
    const tb = b.kickoff_at ? new Date(b.kickoff_at).getTime() : Infinity;
    return ta - tb;
  });

  const finalGames = games.filter(g => g.status === 'final' && picks[g.id]);
  const correct = finalGames.filter(g => picks[g.id] === g.winner).length;
  const totalPicks = Object.keys(picks).length;

  return (
    <div className="min-h-screen flex flex-col">
      <NavBar activePath="/picks" />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">Season Picks</h1>
            <p className="text-gray-500 text-sm mt-0.5">Pick the winner of every 2026 NFL regular season game.</p>
          </div>
          <div className="flex gap-3 flex-wrap">
            {finalGames.length > 0 && (
              <div className="bg-white/60 backdrop-blur-sm border border-white/70 rounded-xl px-4 py-2.5 text-center shadow">
                <p className="text-xs text-gray-400 font-medium">Correct</p>
                <p className="text-lg font-bold text-[#0F172A]">
                  {correct}
                  <span className="text-sm font-normal text-gray-400">/{finalGames.length}</span>
                </p>
              </div>
            )}
            <div className="bg-white/60 backdrop-blur-sm border border-white/70 rounded-xl px-4 py-2.5 text-center shadow">
              <p className="text-xs text-gray-400 font-medium">Picks Made</p>
              <p className="text-lg font-bold text-[#0F172A]">
                {totalPicks}
                <span className="text-sm font-normal text-gray-400">/272</span>
              </p>
            </div>
          </div>
        </div>

        {/* Lock banner */}
        {seasonLocked && (
          <div className="mb-5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm font-medium">
            The season has started — picks are now locked.
          </div>
        )}

        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading…</div>
        ) : games.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            No games scheduled yet. Check back soon.
          </div>
        ) : (
          <>
            {/* Week tabs */}
            <div ref={weekTabsRef} className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
              {weeks.map(w => (
                <button
                  key={w}
                  onClick={() => setActiveWeek(w)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    activeWeek === w
                      ? 'bg-gradient-to-br from-[#2563EB] to-[#1E40AF] text-white'
                      : 'bg-white/60 backdrop-blur-sm text-gray-500 hover:bg-white/80 border border-white/70'
                  }`}
                >
                  Week {w}
                </button>
              ))}
            </div>

            {/* Games for active week */}
            <div className="flex flex-col gap-3">
              {weekGames.length === 0 ? (
                <p className="text-gray-400 text-sm py-6 text-center">No games scheduled for this week yet.</p>
              ) : weekGames.map(game => {
                const pick = picks[game.id];
                const isFinal = game.status === 'final';
                const isLive = game.status === 'in_progress';
                const isSubmitting = submitting === game.id;
                const isCorrect = isFinal && pick && pick === game.winner;
                const isWrong = isFinal && pick && pick !== game.winner;

                return (
                  <div
                    key={game.id}
                    className={`bg-white/60 backdrop-blur-md rounded-xl border shadow-lg p-4 transition-colors ${
                      isCorrect ? 'border-green-200 bg-green-50/40' :
                      isWrong   ? 'border-red-100   bg-red-50/30'   :
                                  'border-white/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">

                      {/* Teams + kickoff */}
                      <div className="min-w-0">
                        <p className="text-[#0F172A] font-semibold text-sm">
                          {fmt(game.away_team)} <span className="text-gray-400 font-normal">@</span> {fmt(game.home_team)}
                        </p>
                        <p className="text-gray-400 text-xs mt-0.5">{kickoffLabel(game.kickoff_at)}</p>
                      </div>

                      {/* Score / status badge */}
                      {isFinal && (
                        <span className="shrink-0 text-xs font-semibold text-gray-500 tabular-nums">
                          {game.away_score}–{game.home_score} F
                        </span>
                      )}
                      {isLive && (
                        <span className="shrink-0 text-xs font-semibold text-green-600 bg-green-50 border border-green-200 rounded px-2 py-0.5">
                          Live {game.away_score ?? '–'}–{game.home_score ?? '–'}
                        </span>
                      )}

                      {/* Pick buttons */}
                      <div className="flex gap-2 shrink-0">
                        {[['away', game.away_team], ['home', game.home_team]].map(([side, abbr]) => {
                          const chosen = pick === side;
                          const isWinner = isFinal && game.winner === side;
                          const isLoser  = isFinal && game.winner && game.winner !== side;
                          return (
                            <button
                              key={side}
                              disabled={seasonLocked || isFinal || isLive || isSubmitting}
                              onClick={() => submitPick(game.id, side)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                chosen && isCorrect  ? 'bg-green-500 text-white ring-2 ring-green-300' :
                                chosen && isWrong    ? 'bg-red-400   text-white ring-2 ring-red-200'   :
                                chosen               ? 'bg-gradient-to-br from-[#2563EB] to-[#1E40AF] text-white ring-2 ring-blue-200' :
                                isWinner             ? 'bg-green-100 text-green-700 border border-green-200' :
                                isLoser              ? 'bg-gray-100  text-gray-400  border border-gray-100' :
                                seasonLocked || isFinal || isLive
                                                     ? 'bg-gray-100  text-gray-400  border border-gray-100 cursor-default' :
                                                       'bg-white/80   text-gray-600  border border-gray-200 hover:border-blue-300 hover:text-blue-600'
                              }`}
                            >
                              {abbr}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Result indicator */}
                    {(isCorrect || isWrong) && (
                      <p className={`text-xs font-semibold mt-2 ${isCorrect ? 'text-green-600' : 'text-red-500'}`}>
                        {isCorrect ? '✓ Correct' : '✗ Incorrect'}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
