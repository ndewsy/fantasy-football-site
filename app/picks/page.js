"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import NavBar from "@/app/components/NavBar";

const TEAM_NAMES = {
  BUF: 'Bills',    MIA: 'Dolphins', NE:  'Patriots', NYJ: 'Jets',
  BAL: 'Ravens',   CIN: 'Bengals',  CLE: 'Browns',   PIT: 'Steelers',
  HOU: 'Texans',   IND: 'Colts',    JAX: 'Jaguars',  TEN: 'Titans',
  DEN: 'Broncos',  KC:  'Chiefs',   LV:  'Raiders',  LAC: 'Chargers',
  DAL: 'Cowboys',  NYG: 'Giants',   PHI: 'Eagles',   WAS: 'Commanders',
  CHI: 'Bears',    DET: 'Lions',    GB:  'Packers',  MIN: 'Vikings',
  ATL: 'Falcons',  CAR: 'Panthers', NO:  'Saints',   TB:  'Buccaneers',
  ARI: 'Cardinals',LAR: 'Rams',     SF:  '49ers',    SEA: 'Seahawks',
};

const TEAM_COLORS = {
  BUF: { p: '#00338D', s: '#C60C30' },
  MIA: { p: '#008E97', s: '#FC4C02' },
  NE:  { p: '#002244', s: '#C60C30' },
  NYJ: { p: '#125740', s: '#FFFFFF' },
  BAL: { p: '#241773', s: '#9E7C0C' },
  CIN: { p: '#101820', s: '#FB4F14' },
  CLE: { p: '#FF3C00', s: '#311D00' },
  PIT: { p: '#101820', s: '#FFB612' },
  HOU: { p: '#03202F', s: '#A71930' },
  IND: { p: '#002C5F', s: '#A2AAAD' },
  JAX: { p: '#006778', s: '#D7A22A' },
  TEN: { p: '#0C2340', s: '#4B92DB' },
  DEN: { p: '#FB4F14', s: '#002244' },
  KC:  { p: '#E31837', s: '#FFB81C' },
  LV:  { p: '#000000', s: '#A5ACAF' },
  LAC: { p: '#0080C6', s: '#FFC20E' },
  DAL: { p: '#003594', s: '#869397' },
  NYG: { p: '#0B2265', s: '#A71930' },
  PHI: { p: '#004C54', s: '#A5ACAF' },
  WAS: { p: '#5A1414', s: '#FFB612' },
  CHI: { p: '#0B162A', s: '#C83803' },
  DET: { p: '#0076B6', s: '#B0B7BC' },
  GB:  { p: '#203731', s: '#FFB612' },
  MIN: { p: '#4F2683', s: '#FFC62F' },
  ATL: { p: '#101820', s: '#A71930' },
  CAR: { p: '#0085CA', s: '#101820' },
  NO:  { p: '#101820', s: '#D3BC8D' },
  TB:  { p: '#D50A0A', s: '#B1BABF' },
  ARI: { p: '#97233F', s: '#FFB612' },
  LAR: { p: '#003594', s: '#FFA300' },
  SF:  { p: '#AA0000', s: '#B3995D' },
  SEA: { p: '#002244', s: '#69BE28' },
};

// Pentagon shield: flat top, pointed bottom
const SHIELD = 'polygon(0 0, 100% 0, 100% 78%, 50% 100%, 0 78%)';

function TeamBadge({ abbr, side, pick, isFinal, isLive, winner, onPick, locked, isSubmitting }) {
  const c = TEAM_COLORS[abbr] ?? { p: '#334155', s: '#64748B' };
  const chosen     = pick === side;
  const otherChosen = !!(pick && pick !== side);
  const isWinner   = isFinal && winner === side;
  const isCorrect  = chosen && isWinner;
  const isWrong    = chosen && isFinal && !isWinner;
  const clickable  = !locked && !isFinal && !isLive && !isSubmitting;

  // Use drop-shadow so the glow follows the shield clip-path
  let filter = 'none';
  if (chosen)       filter = `drop-shadow(0 0 12px ${c.p}cc) drop-shadow(0 0 5px ${c.p}88)`;
  else if (otherChosen) filter = 'grayscale(0.65) brightness(0.5)';

  return (
    <button
      onClick={clickable ? onPick : undefined}
      disabled={!clickable}
      className="relative flex-shrink-0 select-none"
      style={{
        width: 64, height: 80,
        filter,
        transform: chosen ? 'scale(1.1)' : otherChosen ? 'scale(0.9)' : 'scale(1)',
        transition: 'transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.22s ease',
        cursor: clickable ? 'pointer' : 'default',
      }}
    >
      {/* Secondary-color outer shield (acts as border) */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 0,
        background: isCorrect ? '#16a34a' : isWrong ? '#dc2626' : c.s,
        clipPath: SHIELD,
      }} />
      {/* Primary-color inner shield */}
      <div aria-hidden="true" style={{
        position: 'absolute', inset: 3,
        background: c.p,
        clipPath: SHIELD,
      }} />
      {/* Abbreviation */}
      <span
        className="absolute inset-0 flex items-center justify-center z-10 text-white font-black"
        style={{ fontSize: 13, letterSpacing: '0.1em', textShadow: '0 1px 4px rgba(0,0,0,0.8)', paddingBottom: 12 }}
      >
        {abbr}
      </span>
      {/* Grade overlay on chosen badge */}
      {isFinal && chosen && (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-20 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.42)', clipPath: SHIELD }}
        >
          <span style={{
            fontSize: 22, fontWeight: 900, paddingBottom: 12,
            color: isCorrect ? '#86efac' : '#fca5a5',
            textShadow: '0 1px 4px rgba(0,0,0,0.6)',
          }}>
            {isCorrect ? '✓' : '✗'}
          </span>
        </div>
      )}
    </button>
  );
}

function kickoffLabel(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    timeZone: 'America/New_York',
  });
}

export default function PicksPage() {
  const [user, setUser]                 = useState(null);
  const [loading, setLoading]           = useState(true);
  const [games, setGames]               = useState([]);
  const [picks, setPicks]               = useState({});
  const [activeWeek, setActiveWeek]     = useState(1);
  const [submitting, setSubmitting]     = useState(null);
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

      const w1 = (g ?? []).filter(x => x.week === 1 && x.kickoff_at);
      if (w1.length > 0) {
        const earliest = Math.min(...w1.map(x => new Date(x.kickoff_at).getTime()));
        if (earliest <= Date.now()) setSeasonLocked(true);
      }

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

  const weekPicksMade = weekGames.filter(g => picks[g.id]).length;

  // Completion ratio per week — drives the mini progress bars in the tab strip
  const weekProgress = Object.fromEntries(weeks.map(w => {
    const wg = games.filter(g => g.week === w);
    return [w, wg.length > 0 ? wg.filter(g => picks[g.id]).length / wg.length : 0];
  }));

  const finalGames  = games.filter(g => g.status === 'final' && picks[g.id]);
  const correct     = finalGames.filter(g => picks[g.id] === g.winner).length;
  const totalPicks  = Object.keys(picks).length;

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
                  {correct}<span className="text-sm font-normal text-gray-400">/{finalGames.length}</span>
                </p>
              </div>
            )}
            <div className="bg-white/60 backdrop-blur-sm border border-white/70 rounded-xl px-4 py-2.5 text-center shadow">
              <p className="text-xs text-gray-400 font-medium">Picks Made</p>
              <p className="text-lg font-bold text-[#0F172A]">
                {totalPicks}<span className="text-sm font-normal text-gray-400">/272</span>
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
          <div className="text-center py-20 text-gray-400">No games scheduled yet. Check back soon.</div>
        ) : (
          <>
            {/* Week tab strip — W1…W18 with mini progress bars */}
            <div ref={weekTabsRef} className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
              {weeks.map(w => {
                const active = activeWeek === w;
                const pct    = weekProgress[w] ?? 0;
                return (
                  <button
                    key={w}
                    onClick={() => setActiveWeek(w)}
                    className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-gradient-to-br from-[#2563EB] to-[#1E40AF] text-white'
                        : 'bg-white/60 backdrop-blur-sm text-gray-500 hover:bg-white/80 border border-white/70'
                    }`}
                  >
                    <span className="text-[11px] font-bold leading-none">W{w}</span>
                    {/* Mini completion bar */}
                    <div
                      className="w-7 rounded-full overflow-hidden"
                      style={{
                        height: 3,
                        background: active ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.08)',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.round(pct * 100)}%`,
                          background: active ? '#fff' : '#2563EB',
                          borderRadius: 9999,
                          transition: 'width 0.5s ease',
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Week-level progress bar */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">
                  Week {activeWeek}
                </span>
                <span className="text-[11px] text-gray-400 tabular-nums">
                  {weekPicksMade} / {weekGames.length} picked
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.07)' }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: weekGames.length > 0 ? `${(weekPicksMade / weekGames.length) * 100}%` : '0%',
                    background: 'linear-gradient(to right, #2563EB, #1E40AF)',
                  }}
                />
              </div>
            </div>

            {/* Game cards */}
            <div className="flex flex-col gap-3">
              {weekGames.length === 0 ? (
                <p className="text-gray-400 text-sm py-6 text-center">No games scheduled for this week yet.</p>
              ) : weekGames.map(game => {
                const pick       = picks[game.id];
                const isFinal    = game.status === 'final';
                const isLive     = game.status === 'in_progress';
                const isSub      = submitting === game.id;
                const isCorrect  = isFinal && pick && pick === game.winner;
                const isWrong    = isFinal && pick && pick !== game.winner;

                return (
                  <div
                    key={game.id}
                    className={`bg-white/60 backdrop-blur-md rounded-xl border shadow-lg transition-colors ${
                      isCorrect ? 'border-green-200 bg-green-50/40' :
                      isWrong   ? 'border-red-100 bg-red-50/30'     :
                                  'border-white/70'
                    }`}
                  >
                    {/* Kickoff + score/status */}
                    <div className="flex items-center justify-between px-4 pt-3.5 pb-0">
                      <p className="text-[11px] text-gray-400">{kickoffLabel(game.kickoff_at)}</p>
                      {isFinal && (
                        <span className="text-[11px] font-semibold text-gray-500 tabular-nums bg-gray-100 rounded px-2 py-0.5">
                          {game.away_score}–{game.home_score} F
                        </span>
                      )}
                      {isLive && (
                        <span className="text-[11px] font-semibold text-green-600 bg-green-50 border border-green-200 rounded px-2 py-0.5">
                          LIVE {game.away_score ?? '–'}–{game.home_score ?? '–'}
                        </span>
                      )}
                    </div>

                    {/* Badge row — away · vs · home */}
                    <div className="flex items-start justify-center gap-5 px-4 pt-4 pb-4">

                      {/* Away */}
                      <div className="flex flex-col items-center gap-1.5">
                        <TeamBadge
                          abbr={game.away_team} side="away"
                          pick={pick} isFinal={isFinal} isLive={isLive}
                          winner={game.winner}
                          onPick={() => submitPick(game.id, 'away')}
                          locked={seasonLocked} isSubmitting={isSub}
                        />
                        <span className="text-[11px] text-gray-500 font-medium text-center w-16 leading-tight">
                          {TEAM_NAMES[game.away_team] ?? game.away_team}
                        </span>
                      </div>

                      {/* vs badge — mt-[29px] centers it on the 80px shield */}
                      <div className="flex flex-col items-center" style={{ marginTop: 29 }}>
                        <span
                          className="font-black text-gray-400 bg-gray-100 rounded-md uppercase tracking-widest"
                          style={{ fontSize: 9, padding: '3px 6px' }}
                        >
                          vs
                        </span>
                        <span className="text-gray-300 font-medium" style={{ fontSize: 8, marginTop: 2 }}>at</span>
                      </div>

                      {/* Home */}
                      <div className="flex flex-col items-center gap-1.5">
                        <TeamBadge
                          abbr={game.home_team} side="home"
                          pick={pick} isFinal={isFinal} isLive={isLive}
                          winner={game.winner}
                          onPick={() => submitPick(game.id, 'home')}
                          locked={seasonLocked} isSubmitting={isSub}
                        />
                        <span className="text-[11px] text-gray-500 font-medium text-center w-16 leading-tight">
                          {TEAM_NAMES[game.home_team] ?? game.home_team}
                        </span>
                      </div>

                    </div>
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
