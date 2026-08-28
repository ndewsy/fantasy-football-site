"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import NavBar from "@/app/components/NavBar";
import PageTitle from "@/app/components/PageTitle";

function RankBadge({ rank }) {
  const styles = {
    1: { bg: '#FFB612', color: '#1a1000' },
    2: { bg: '#A2AAAD', color: '#1a1a1a' },
    3: { bg: '#C06C2C', color: '#fff'    },
  };
  const s = styles[rank];
  return (
    <span
      className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black shrink-0"
      style={s ? { background: s.bg, color: s.color } : { background: 'transparent', color: '#9CA3AF' }}
    >
      {rank}
    </span>
  );
}

export default function LeaderboardPage() {
  const [loading, setLoading]         = useState(true);
  const [gamesGraded, setGamesGraded] = useState(0);
  const [entries, setEntries]         = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/login'; return; }
      setCurrentUserId(user.id);

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/leaderboard', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) { setLoading(false); return; }

      const { gamesGraded: graded, entries: rows } = await res.json();
      setGamesGraded(graded ?? 0);
      setEntries(rows ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const pctDisplay = pct => `${(pct * 100).toFixed(1)}%`;

  return (
    <div className="min-h-screen flex flex-col lg:pl-56">
      <NavBar activePath="/leaderboard" />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">

        {/* Header */}
        <div className="mb-6 text-center">
          <PageTitle title="Season Leaderboard" />
          <p className="text-gray-500 text-sm mt-0.5">
            Only users who submitted all 272 picks appear here.
          </p>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading…</div>
        ) : gamesGraded === 0 ? (

          /* Pre-season state */
          <div className="bg-white/60 backdrop-blur-md rounded-xl border border-white/70 shadow-lg px-6 py-12 text-center">
            <p className="text-4xl mb-4">🏈</p>
            <h2 className="text-lg font-bold text-[#0F172A] mb-2">Leaderboard opens once Week 1 kicks off</h2>
            <p className="text-gray-400 text-sm max-w-sm mx-auto">
              Head over to the Schedule tab, lock in your picks for all 272 games, and come back after the first game goes final.
            </p>
          </div>

        ) : entries.length === 0 ? (

          /* Season started but no one has all 272 picks yet */
          <div className="bg-white/60 backdrop-blur-md rounded-xl border border-white/70 shadow-lg px-6 py-12 text-center">
            <h2 className="text-lg font-bold text-[#0F172A] mb-2">No qualifying entries yet</h2>
            <p className="text-gray-400 text-sm max-w-sm mx-auto">
              Nobody has submitted all 272 picks so far. Be the first to complete your ballot.
            </p>
          </div>

        ) : (
          <>
            {/* Progress bar — games graded so far */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Season Progress</span>
                <span className="text-[11px] text-gray-400 tabular-nums">{gamesGraded} / 272 graded</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.07)' }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${(gamesGraded / 272) * 100}%`, background: 'linear-gradient(to right, #2563EB, #1E40AF)' }}
                />
              </div>
            </div>

            {/* Tiebreaker note */}
            <p className="text-[11px] text-gray-400 mb-4">
              Ranked by correct % — ties broken by raw correct count, then alphabetically.
            </p>

            {/* Leaderboard table */}
            <div className="bg-white/60 backdrop-blur-md rounded-xl border border-white/70 shadow-lg overflow-hidden">
              {/* Column headers */}
              <div className="grid grid-cols-[2rem_1fr_auto_auto_auto] items-center gap-3 px-4 py-2.5 border-b border-gray-100/80 bg-white/40">
                <span />
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Player</span>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Correct</span>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Graded</span>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">%</span>
              </div>

              <div className="divide-y divide-gray-100/60">
                {entries.map((entry, i) => {
                  const isSelf = entry.user_id === currentUserId;
                  return (
                    <div
                      key={entry.user_id}
                      className={`grid grid-cols-[2rem_1fr_auto_auto_auto] items-center gap-3 px-4 py-3 transition-colors ${
                        isSelf ? 'bg-blue-50/50 border-l-2 border-[#2563EB]' : i % 2 === 0 ? 'bg-white/20' : ''
                      }`}
                    >
                      <RankBadge rank={entry.rank} />

                      <div className="min-w-0">
                        <p className={`text-sm font-semibold truncate ${isSelf ? 'text-[#2563EB]' : 'text-[#0F172A]'}`}>
                          {entry.display_name}
                          {isSelf && <span className="ml-1.5 text-[10px] font-bold text-[#2563EB] bg-blue-100 rounded px-1 py-0.5">you</span>}
                        </p>
                      </div>

                      <span className={`text-sm font-bold tabular-nums text-right ${isSelf ? 'text-[#2563EB]' : 'text-[#0F172A]'}`}>
                        {entry.correct}
                      </span>

                      <span className="text-sm text-gray-400 tabular-nums text-right">
                        {entry.graded}
                      </span>

                      <span className={`text-sm font-bold tabular-nums text-right min-w-[3.5rem] ${isSelf ? 'text-[#2563EB]' : 'text-[#0F172A]'}`}>
                        {pctDisplay(entry.pct)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
