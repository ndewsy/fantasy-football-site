"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import NavBar from "@/app/components/NavBar";
import { anton } from "@/lib/fonts";

// ── team metadata ───────────────────────────────────────────────────────────

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

const DIVISIONS = {
  'AFC East':  ['BUF', 'MIA', 'NE',  'NYJ'],
  'AFC North': ['BAL', 'CIN', 'CLE', 'PIT'],
  'AFC South': ['HOU', 'IND', 'JAX', 'TEN'],
  'AFC West':  ['DEN', 'KC',  'LV',  'LAC'],
  'NFC East':  ['DAL', 'NYG', 'PHI', 'WAS'],
  'NFC North': ['CHI', 'DET', 'GB',  'MIN'],
  'NFC South': ['ATL', 'CAR', 'NO',  'TB' ],
  'NFC West':  ['ARI', 'LAR', 'SF',  'SEA'],
};

// Reverse map: team → division name
const TEAM_DIV = {};
for (const [div, teams] of Object.entries(DIVISIONS)) {
  for (const t of teams) TEAM_DIV[t] = div;
}

const CONFERENCE_DIVS = {
  AFC: ['AFC East', 'AFC North', 'AFC South', 'AFC West'],
  NFC: ['NFC East', 'NFC North', 'NFC South', 'NFC West'],
};

// Pentagon shield: flat top, pointed bottom
const SHIELD = 'polygon(0 0, 100% 0, 100% 78%, 50% 100%, 0 78%)';

// ── standings computation ───────────────────────────────────────────────────

function buildRecords(games, picks) {
  const rec = {};
  for (const teams of Object.values(DIVISIONS))
    for (const t of teams) rec[t] = { wins: 0, losses: 0 };

  for (const game of games) {
    const side = picks[game.id];
    if (!side) continue;
    const winner = side === 'home' ? game.home_team : game.away_team;
    const loser  = side === 'home' ? game.away_team : game.home_team;
    if (rec[winner]) rec[winner].wins++;
    if (rec[loser])  rec[loser].losses++;
  }
  return rec;
}

function winPct(rec) {
  const g = rec.wins + rec.losses;
  return g > 0 ? rec.wins / g : 0;
}

function pctStr(rec) {
  const g = rec.wins + rec.losses;
  if (g === 0) return '—';
  return (rec.wins / g).toFixed(3).replace(/^0/, '');
}

function headToHead(a, b, games, picks) {
  let aW = 0, bW = 0;
  for (const game of games) {
    const involves = (game.home_team === a && game.away_team === b)
                  || (game.home_team === b && game.away_team === a);
    if (!involves) continue;
    const side = picks[game.id];
    if (!side) continue;
    const winner = side === 'home' ? game.home_team : game.away_team;
    if (winner === a) aW++; else bW++;
  }
  return aW > bW ? -1 : bW > aW ? 1 : 0; // -1 = a wins h2h
}

function makeCmp(records, games, picks) {
  return (a, b) => {
    const pA = winPct(records[a] ?? { wins: 0, losses: 0 });
    const pB = winPct(records[b] ?? { wins: 0, losses: 0 });
    if (Math.abs(pA - pB) > 1e-9) return pB - pA;
    const h2h = headToHead(a, b, games, picks);
    if (h2h !== 0) return h2h;
    return (TEAM_NAMES[a] ?? a).localeCompare(TEAM_NAMES[b] ?? b);
  };
}

function computeStandings(games, picks) {
  const records = buildRecords(games, picks);
  const cmp     = makeCmp(records, games, picks);

  // Sort each division; first place in each is the div winner
  const sortedDivs = {};
  for (const [div, teams] of Object.entries(DIVISIONS))
    sortedDivs[div] = [...teams].sort(cmp);

  const result = {};
  for (const [conf, divNames] of Object.entries(CONFERENCE_DIVS)) {
    const divWinners  = divNames.map(d => sortedDivs[d][0]);
    const seeds1to4   = [...divWinners].sort(cmp);
    const nonWinners  = divNames.flatMap(d => sortedDivs[d].slice(1)).sort(cmp);
    const wildCards   = nonWinners.slice(0, 3);  // seeds 5–7
    const eliminated  = nonWinners.slice(3);

    result[conf] = {
      seeds: [...seeds1to4, ...wildCards],
      eliminated,
      sortedDivs: Object.fromEntries(divNames.map(d => [d, sortedDivs[d]])),
      records,
    };
  }
  return result;
}

// ── components ──────────────────────────────────────────────────────────────

function TeamBadge({ abbr, side, pick, isFinal, isLive, winner, onPick, locked, isSubmitting }) {
  const c = TEAM_COLORS[abbr] ?? { p: '#334155', s: '#64748B' };
  const chosen      = pick === side;
  const otherChosen = !!(pick && pick !== side);
  const isWinner    = isFinal && winner === side;
  const isCorrect   = chosen && isWinner;
  const isWrong     = chosen && isFinal && !isWinner;
  const clickable   = !locked && !isFinal && !isLive && !isSubmitting;

  let filter = 'none';
  if (chosen)           filter = `drop-shadow(0 0 12px ${c.p}cc) drop-shadow(0 0 5px ${c.p}88)`;
  else if (otherChosen) filter = 'grayscale(0.65) brightness(0.5)';

  return (
    <button
      onClick={clickable ? onPick : undefined}
      disabled={!clickable}
      className="relative flex-shrink-0 select-none"
      style={{
        width: 64, height: 80, filter,
        transform: chosen ? 'scale(1.1)' : otherChosen ? 'scale(0.9)' : 'scale(1)',
        transition: 'transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.22s ease',
        cursor: clickable ? 'pointer' : 'default',
      }}
    >
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: isCorrect ? '#16a34a' : isWrong ? '#dc2626' : c.s, clipPath: SHIELD }} />
      <div aria-hidden="true" style={{ position: 'absolute', inset: 3, background: c.p, clipPath: SHIELD }} />
      <span className="absolute inset-0 flex items-center justify-center z-10 text-white font-black"
        style={{ fontSize: 13, letterSpacing: '0.1em', textShadow: '0 1px 4px rgba(0,0,0,0.8)', paddingBottom: 12 }}>
        {abbr}
      </span>
      {isFinal && chosen && (
        <div aria-hidden="true" className="absolute inset-0 z-20 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.42)', clipPath: SHIELD }}>
          <span style={{ fontSize: 22, fontWeight: 900, paddingBottom: 12, color: isCorrect ? '#86efac' : '#fca5a5', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
            {isCorrect ? '✓' : '✗'}
          </span>
        </div>
      )}
    </button>
  );
}

// Static (non-interactive) shield chip for the standings view
function TeamChip({ abbr, dim = [40, 50] }) {
  const c = TEAM_COLORS[abbr] ?? { p: '#334155', s: '#64748B' };
  const [w, h] = dim;
  const fontSize  = w <= 30 ? 7  : 9;
  const pb        = w <= 30 ? 6  : 8;
  const border    = w <= 30 ? 1.5 : 2;
  return (
    <div className="relative flex-shrink-0" style={{ width: w, height: h }}>
      <div style={{ position: 'absolute', inset: 0,      background: c.s, clipPath: SHIELD }} />
      <div style={{ position: 'absolute', inset: border, background: c.p, clipPath: SHIELD }} />
      <span className="absolute inset-0 flex items-center justify-center text-white font-black z-10"
        style={{ fontSize, letterSpacing: '0.08em', textShadow: '0 1px 3px rgba(0,0,0,0.8)', paddingBottom: pb }}>
        {abbr}
      </span>
    </div>
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

// ── signup modal ─────────────────────────────────────────────────────────────

function SignupModal({ onClose }) {
  const [mode, setMode]         = useState('signup');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [message, setMessage]   = useState('');
  const [done, setDone]         = useState(false);

  async function handleSubmit() {
    if (!email || !password) return;
    setLoading(true);
    setMessage('');
    const supabase = createClient();
    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setMessage(error.message);
      else setDone(true);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
      else window.location.reload();
    }
    setLoading(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="4" y1="4" x2="16" y2="16" /><line x1="16" y1="4" x2="4" y2="16" />
          </svg>
        </button>

        {done ? (
          <div className="text-center py-2">
            <p className="text-4xl mb-3">📬</p>
            <h2 className="text-lg font-bold text-[#0F172A] mb-2">Check your email</h2>
            <p className="text-sm text-gray-500 max-w-xs mx-auto">
              We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then come back to make your picks.
            </p>
            <button onClick={onClose} className="mt-6 text-sm text-blue-600 hover:text-blue-700 font-medium">
              Got it, close
            </button>
          </div>
        ) : (
          <>
            <div className="mb-5 pr-6">
              <h2 className="text-xl font-bold text-[#0F172A]">
                {mode === 'signup' ? 'Make your picks — it\'s free' : 'Welcome back'}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {mode === 'signup'
                  ? 'Create a free account to pick every 2026 NFL game.'
                  : 'Sign in to view and edit your picks.'}
              </p>
            </div>

            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1.5">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="you@example.com" autoFocus
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs text-gray-500 mb-1.5">Password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-[#0F172A] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>

            {message && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">{message}</div>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading || !email || !password}
              className="w-full bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-bold py-2.5 rounded-xl transition-all disabled:opacity-50 text-sm"
            >
              {loading ? 'Loading…' : mode === 'signup' ? 'Create Free Account' : 'Sign In'}
            </button>

            <p className="text-center text-xs text-gray-500 mt-4">
              {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setMessage(''); }}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                {mode === 'signup' ? 'Sign in' : 'Sign up'}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ── page ────────────────────────────────────────────────────────────────────

export default function PicksPage() {
  const [user, setUser]                 = useState(null);
  const [loading, setLoading]           = useState(true);
  const [games, setGames]               = useState([]);
  const [picks, setPicks]               = useState({});
  const [activeWeek, setActiveWeek]     = useState(1);
  const [submitting, setSubmitting]     = useState(null);
  const [seasonLocked, setSeasonLocked] = useState(false);
  const [viewMode, setViewMode]           = useState('schedule');
  const [selectedTeam, setSelectedTeam]   = useState(null);
  const [showSignupModal, setShowSignupModal] = useState(false);
  const weekTabsRef = useRef(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user: u } } = await supabase.auth.getUser();
      setUser(u ?? null);

      const fetchHeaders = {};
      if (u) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) fetchHeaders.Authorization = `Bearer ${session.access_token}`;
      }
      const res = await fetch('/api/picks', { headers: fetchHeaders });
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
    if (!user) { setShowSignupModal(true); return; }
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

  // ── derived ──────────────────────────────────────────────────────────────

  const weeks = [...new Set(games.map(g => g.week))].sort((a, b) => a - b);
  const weekGames = games.filter(g => g.week === activeWeek).sort((a, b) => {
    const ta = a.kickoff_at ? new Date(a.kickoff_at).getTime() : Infinity;
    const tb = b.kickoff_at ? new Date(b.kickoff_at).getTime() : Infinity;
    return ta - tb;
  });
  const weekPicksMade = weekGames.filter(g => picks[g.id]).length;
  const weekProgress  = Object.fromEntries(weeks.map(w => {
    const wg = games.filter(g => g.week === w);
    return [w, wg.length > 0 ? wg.filter(g => picks[g.id]).length / wg.length : 0];
  }));

  const finalGames = games.filter(g => g.status === 'final' && picks[g.id]);
  const correct    = finalGames.filter(g => picks[g.id] === g.winner).length;
  const totalPicks = Object.keys(picks).length;

  const standings = games.length > 0 ? computeStandings(games, picks) : null;

  const teamGames = selectedTeam
    ? games
        .filter(g => g.home_team === selectedTeam || g.away_team === selectedTeam)
        .sort((a, b) => a.week - b.week)
    : [];

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col lg:pl-56">
      <NavBar activePath="/picks" />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
          <div>
            <h1 className={`${anton.className} text-3xl uppercase tracking-tight text-[#0F172A]`}>Season Picks</h1>
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
            {/* View toggle */}
            <div className="flex gap-2 mb-5">
              {[['schedule', 'By Week'], ['byteam', 'By Team'], ['standings', 'Standings']].map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
                    viewMode === mode
                      ? 'bg-gradient-to-br from-[#2563EB] to-[#1E40AF] text-white'
                      : 'bg-white/60 backdrop-blur-sm text-gray-500 hover:bg-white/80 border border-white/70'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* ── Schedule view ───────────────────────────────────────────── */}
            {viewMode === 'schedule' && (
              <>
                {/* Week tab strip — 6 cols on mobile, 9 on sm+, wraps to 2 rows */}
                <div ref={weekTabsRef} className="grid grid-cols-6 sm:grid-cols-9 gap-1.5 mb-5">
                  {weeks.map(w => {
                    const active = activeWeek === w;
                    const pct    = weekProgress[w] ?? 0;
                    return (
                      <button
                        key={w}
                        onClick={() => setActiveWeek(w)}
                        className={`w-full flex flex-col items-center gap-1 px-2 py-2 rounded-lg transition-colors ${
                          active
                            ? 'bg-gradient-to-br from-[#2563EB] to-[#1E40AF] text-white'
                            : 'bg-white/60 backdrop-blur-sm text-gray-500 hover:bg-white/80 border border-white/70'
                        }`}
                      >
                        <span className="text-[11px] font-bold leading-none">W{w}</span>
                        <div className="w-7 rounded-full overflow-hidden" style={{ height: 3, background: active ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.08)' }}>
                          <div style={{ height: '100%', width: `${Math.round(pct * 100)}%`, background: active ? '#fff' : '#2563EB', borderRadius: 9999, transition: 'width 0.5s ease' }} />
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Week progress bar */}
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Week {activeWeek}</span>
                    <span className="text-[11px] text-gray-400 tabular-nums">{weekPicksMade} / {weekGames.length} picked</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.07)' }}>
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: weekGames.length > 0 ? `${(weekPicksMade / weekGames.length) * 100}%` : '0%', background: 'linear-gradient(to right, #2563EB, #1E40AF)' }} />
                  </div>
                </div>

                {/* Game cards */}
                <div className="flex flex-col gap-3">
                  {weekGames.length === 0 ? (
                    <p className="text-gray-400 text-sm py-6 text-center">No games scheduled for this week yet.</p>
                  ) : weekGames.map(game => {
                    const pick      = picks[game.id];
                    const isFinal   = game.status === 'final';
                    const isLive    = game.status === 'in_progress';
                    const isSub     = submitting === game.id;
                    const isCorrect = isFinal && pick && pick === game.winner;
                    const isWrong   = isFinal && pick && pick !== game.winner;

                    return (
                      <div key={game.id}
                        className={`bg-white/60 backdrop-blur-md rounded-xl border shadow-lg transition-colors ${
                          isCorrect ? 'border-green-200 bg-green-50/40' :
                          isWrong   ? 'border-red-100 bg-red-50/30'     :
                                      'border-white/70'
                        }`}
                      >
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

                        <div className="flex items-start justify-center gap-5 px-4 pt-4 pb-4">
                          <div className="flex flex-col items-center gap-1.5">
                            <TeamBadge abbr={game.away_team} side="away" pick={pick} isFinal={isFinal} isLive={isLive}
                              winner={game.winner} onPick={() => submitPick(game.id, 'away')} locked={seasonLocked} isSubmitting={isSub} />
                            <span className="text-[11px] text-gray-500 font-medium text-center w-16 leading-tight">
                              {TEAM_NAMES[game.away_team] ?? game.away_team}
                            </span>
                          </div>

                          <div className="flex flex-col items-center" style={{ marginTop: 29 }}>
                            <span className="font-black text-gray-400 bg-gray-100 rounded-md uppercase tracking-widest" style={{ fontSize: 9, padding: '3px 6px' }}>vs</span>
                            <span className="text-gray-300 font-medium" style={{ fontSize: 8, marginTop: 2 }}>at</span>
                          </div>

                          <div className="flex flex-col items-center gap-1.5">
                            <TeamBadge abbr={game.home_team} side="home" pick={pick} isFinal={isFinal} isLive={isLive}
                              winner={game.winner} onPick={() => submitPick(game.id, 'home')} locked={seasonLocked} isSubmitting={isSub} />
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

            {/* ── By Team view ────────────────────────────────────────────── */}
            {viewMode === 'byteam' && (
              <>
                {/* Team selector — 8 division rows */}
                <div className="mb-5 bg-white/60 backdrop-blur-md rounded-xl border border-white/70 shadow-lg overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-100/80 bg-white/40">
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Select a team</p>
                  </div>
                  <div className="p-3 flex flex-col gap-2">
                    {Object.entries(DIVISIONS).map(([div, teams]) => (
                      <div key={div} className="flex items-center gap-2">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide shrink-0 text-right leading-snug"
                          style={{ width: 58 }}>
                          {div.replace('AFC ', '').replace('NFC ', '')}<br />
                          <span className="text-gray-300">{div.startsWith('AFC') ? 'AFC' : 'NFC'}</span>
                        </span>
                        <div className="flex gap-1.5">
                          {teams.map(abbr => {
                            const c   = TEAM_COLORS[abbr] ?? { p: '#334155', s: '#64748B' };
                            const sel = selectedTeam === abbr;
                            return (
                              <button
                                key={abbr}
                                onClick={() => setSelectedTeam(sel ? null : abbr)}
                                className="relative flex-shrink-0"
                                style={{
                                  width: 40, height: 50,
                                  filter: sel ? `drop-shadow(0 0 10px ${c.p}cc)` : 'none',
                                  transform: sel ? 'scale(1.1)' : 'scale(1)',
                                  transition: 'transform 0.2s ease, filter 0.2s ease',
                                }}
                              >
                                <div style={{ position: 'absolute', inset: 0,   background: sel ? c.s : '#D1D5DB', clipPath: SHIELD }} />
                                <div style={{ position: 'absolute', inset: 2.5, background: sel ? c.p : '#9CA3AF', clipPath: SHIELD }} />
                                <span className="absolute inset-0 flex items-center justify-center text-white font-black z-10"
                                  style={{ fontSize: 8.5, letterSpacing: '0.08em', textShadow: '0 1px 3px rgba(0,0,0,0.8)', paddingBottom: 8 }}>
                                  {abbr}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {!selectedTeam ? (
                  <p className="text-center text-gray-400 text-sm py-6">Select a team above to see their schedule.</p>
                ) : (
                  <>
                    {/* Team header */}
                    <div className="flex items-center gap-3 mb-4">
                      <TeamChip abbr={selectedTeam} dim={[48, 60]} />
                      <div>
                        <h2 className="text-lg font-bold text-[#0F172A]">{TEAM_NAMES[selectedTeam]}</h2>
                        <p className="text-xs text-gray-400">{TEAM_DIV[selectedTeam]}</p>
                      </div>
                      <div className="ml-auto text-right shrink-0">
                        <p className="text-[11px] text-gray-400">Picked</p>
                        <p className="text-sm font-bold text-[#0F172A] tabular-nums">
                          {teamGames.filter(g => picks[g.id]).length}
                          <span className="font-normal text-gray-400">/{teamGames.length}</span>
                        </p>
                      </div>
                    </div>

                    {/* Game cards — identical to week view, with week chip in header */}
                    <div className="flex flex-col gap-3">
                      {teamGames.map(game => {
                        const pick      = picks[game.id];
                        const isFinal   = game.status === 'final';
                        const isLive    = game.status === 'in_progress';
                        const isSub     = submitting === game.id;
                        const isCorrect = isFinal && pick && pick === game.winner;
                        const isWrong   = isFinal && pick && pick !== game.winner;
                        return (
                          <div key={game.id}
                            className={`bg-white/60 backdrop-blur-md rounded-xl border shadow-lg transition-colors ${
                              isCorrect ? 'border-green-200 bg-green-50/40' :
                              isWrong   ? 'border-red-100 bg-red-50/30'     :
                                          'border-white/70'
                            }`}
                          >
                            <div className="flex items-center justify-between px-4 pt-3.5 pb-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-[#2563EB] bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">
                                  W{game.week}
                                </span>
                                <p className="text-[11px] text-gray-400">{kickoffLabel(game.kickoff_at)}</p>
                              </div>
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

                            <div className="flex items-start justify-center gap-5 px-4 pt-4 pb-4">
                              <div className="flex flex-col items-center gap-1.5">
                                <TeamBadge abbr={game.away_team} side="away" pick={pick} isFinal={isFinal} isLive={isLive}
                                  winner={game.winner} onPick={() => submitPick(game.id, 'away')} locked={seasonLocked} isSubmitting={isSub} />
                                <span className="text-[11px] text-gray-500 font-medium text-center w-16 leading-tight">
                                  {TEAM_NAMES[game.away_team] ?? game.away_team}
                                </span>
                              </div>

                              <div className="flex flex-col items-center" style={{ marginTop: 29 }}>
                                <span className="font-black text-gray-400 bg-gray-100 rounded-md uppercase tracking-widest" style={{ fontSize: 9, padding: '3px 6px' }}>vs</span>
                                <span className="text-gray-300 font-medium" style={{ fontSize: 8, marginTop: 2 }}>at</span>
                              </div>

                              <div className="flex flex-col items-center gap-1.5">
                                <TeamBadge abbr={game.home_team} side="home" pick={pick} isFinal={isFinal} isLive={isLive}
                                  winner={game.winner} onPick={() => submitPick(game.id, 'home')} locked={seasonLocked} isSubmitting={isSub} />
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
              </>
            )}

            {/* ── Standings view ──────────────────────────────────────────── */}
            {viewMode === 'standings' && standings && (
              <>
                <p className="text-[11px] text-gray-400 mb-4">
                  Based on your picks — projected record counts every game you've picked, played or not.
                  Ties broken by head-to-head result between tied teams, then alphabetically.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {['AFC', 'NFC'].map(conf => {
                    const { seeds, eliminated, sortedDivs, records } = standings[conf];
                    return (
                      <div key={conf} className="flex flex-col gap-3">

                        {/* Playoff picture card */}
                        <div className="bg-white/60 backdrop-blur-md rounded-xl border border-white/70 shadow-lg overflow-hidden">
                          <div className="px-4 py-3 border-b border-gray-100/80 bg-white/40">
                            <h3 className="text-sm font-bold text-[#0F172A]">{conf} Playoff Picture</h3>
                          </div>

                          {/* Seeds 1–4: division winners */}
                          <div className="divide-y divide-gray-100/60">
                            {seeds.slice(0, 4).map((team, i) => {
                              const rec      = records[team];
                              const divShort = (TEAM_DIV[team] ?? '').replace(`${conf} `, '');
                              return (
                                <div key={team} className="flex items-center gap-3 px-4 py-2.5 bg-blue-50/20">
                                  <span className="text-sm font-black text-[#2563EB] w-4 text-center shrink-0">{i + 1}</span>
                                  <TeamChip abbr={team} />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-semibold text-[#0F172A] truncate">{TEAM_NAMES[team]}</p>
                                    <p className="text-[10px] text-[#2563EB] font-semibold">{divShort} Div</p>
                                  </div>
                                  <span className="text-sm font-bold text-[#0F172A] tabular-nums shrink-0">{rec.wins}–{rec.losses}</span>
                                </div>
                              );
                            })}

                            {/* Wild card divider */}
                            <div className="px-4 py-1.5 bg-gray-50/70 flex items-center gap-2">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Wild Cards</span>
                            </div>

                            {/* Seeds 5–7: wild cards */}
                            {seeds.slice(4).map((team, i) => {
                              const rec = records[team];
                              return (
                                <div key={team} className="flex items-center gap-3 px-4 py-2.5">
                                  <span className="text-sm font-semibold text-gray-400 w-4 text-center shrink-0">{i + 5}</span>
                                  <TeamChip abbr={team} />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-semibold text-[#0F172A] truncate">{TEAM_NAMES[team]}</p>
                                  </div>
                                  <span className="text-sm font-bold text-[#0F172A] tabular-nums shrink-0">{rec.wins}–{rec.losses}</span>
                                </div>
                              );
                            })}

                            {/* Out of playoffs */}
                            <div className="px-4 py-1.5 bg-gray-50/70">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Out of Playoffs</span>
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-2 px-4 py-3">
                              {eliminated.map(team => {
                                const rec = records[team];
                                return (
                                  <div key={team} className="flex items-center gap-1.5">
                                    <div className="relative flex-shrink-0 opacity-50" style={{ width: 28, height: 35 }}>
                                      <div style={{ position: 'absolute', inset: 0,   background: TEAM_COLORS[team]?.s ?? '#94A3B8', clipPath: SHIELD }} />
                                      <div style={{ position: 'absolute', inset: 1.5, background: TEAM_COLORS[team]?.p ?? '#334155', clipPath: SHIELD }} />
                                      <span className="absolute inset-0 flex items-center justify-center text-white font-black z-10"
                                        style={{ fontSize: 7, textShadow: '0 1px 2px rgba(0,0,0,0.8)', paddingBottom: 6 }}>
                                        {team}
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-gray-400 tabular-nums">{rec.wins}–{rec.losses}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Division standings cards */}
                        {Object.entries(sortedDivs).map(([divName, teams]) => (
                          <div key={divName} className="bg-white/60 backdrop-blur-md rounded-xl border border-white/70 shadow-lg overflow-hidden">
                            <div className="px-4 py-2.5 border-b border-gray-100/80 bg-white/40">
                              <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{divName}</h4>
                            </div>
                            <div className="divide-y divide-gray-100/60">
                              {teams.map((team, rank) => {
                                const rec = records[team];
                                return (
                                  <div key={team} className={`flex items-center gap-3 px-4 py-2 ${rank === 0 ? 'bg-blue-50/20' : ''}`}>
                                    <span className={`text-xs font-bold w-3 text-center shrink-0 ${rank === 0 ? 'text-[#2563EB]' : 'text-gray-300'}`}>
                                      {rank + 1}
                                    </span>
                                    <TeamChip abbr={team} dim={[36, 45]} />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-semibold text-[#0F172A] truncate">{TEAM_NAMES[team]}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <p className="text-xs font-bold text-[#0F172A] tabular-nums">{rec.wins}–{rec.losses}</p>
                                      <p className="text-[10px] text-gray-400 tabular-nums">{pctStr(rec)}</p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}

                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </main>

      {showSignupModal && <SignupModal onClose={() => setShowSignupModal(false)} />}
    </div>
  );
}
