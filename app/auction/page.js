"use client";
import { useEffect, useState } from "react";
import { Anton } from "next/font/google";
import { createClient } from "@/lib/supabase";
import NavBar from "@/app/components/NavBar";
import PlayerHeadshot from "@/app/components/PlayerHeadshot";
import PromoPrice from "@/app/components/PromoPrice";
import { isPromoActive } from "@/lib/promo";

const anton = Anton({ subsets: ["latin"], weight: "400" });

const FORMATS = ["Auction 1QB", "Auction SF"];

const CREATORS = [
  { id: "ffhuddle", name: "FantasyFootballHuddle" },
];

function formatPct(pct) {
  if (pct === null || pct === undefined) return "—";
  return `${Number(pct).toFixed(1)}%`;
}

export default function AuctionPage() {
  const promoActive = isPromoActive();
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [isDashboardUser, setIsDashboardUser] = useState(false);
  const [activeCreatorIds, setActiveCreatorIds] = useState([]);
  const [loading, setLoading] = useState(true);

  const [format, setFormat] = useState(FORMATS[0]);
  const creator = CREATORS[0].id;
  const [board, setBoard] = useState(null);
  const [playersById, setPlayersById] = useState({});
  const [boardLoading, setBoardLoading] = useState(true);
  const [teamBuildOpen, setTeamBuildOpen] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      const [subResult, ownProfileResult, activeCreatorsResult] = await Promise.all([
        user
          ? supabase.from("subscriptions").select("*").eq("user_id", user.id).maybeSingle()
          : Promise.resolve({ data: null }),
        user
          ? supabase.from("profiles").select("role, is_creator").eq("id", user.id).maybeSingle()
          : Promise.resolve({ data: null }),
        fetch("/api/creators/active").then((r) => r.ok ? r.json() : { creators: [] }).catch(() => ({ creators: [] })),
      ]);

      setSubscription(subResult.data);
      setIsDashboardUser(!!(ownProfileResult.data && (ownProfileResult.data.role === "admin" || ownProfileResult.data.is_creator)));
      setActiveCreatorIds((activeCreatorsResult.creators || []).map((c) => c.creator_id));
      setLoading(false);
    }
    load();
  }, []);

  const isFlatAccessGranted = subscription?.plan_type === "flat_access"
    && subscription?.status === "active"
    && activeCreatorIds.length > 0;
  const isSubscribed = isDashboardUser
    || (!!subscription && subscription.plan_type !== "flat_access" && subscription.status === "active")
    || isFlatAccessGranted;

  useEffect(() => {
    if (!isSubscribed) return;
    setBoardLoading(true);
    setTeamBuildOpen(false);
    fetch(`/api/auction-rankings?creator_id=${encodeURIComponent(creator)}&format=${encodeURIComponent(format)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setBoard)
      .catch(() => setBoard(null))
      .finally(() => setBoardLoading(false));
  }, [creator, format, isSubscribed]);

  useEffect(() => {
    if (!board?.players?.length) { setPlayersById({}); return; }
    const supabase = createClient();
    const ids = board.players.map((p) => p.player_id);
    supabase
      .from("players")
      .select("id, name, position, team, espn_id, sleeper_id")
      .in("id", ids)
      .then(({ data }) => {
        setPlayersById(Object.fromEntries((data || []).map((p) => [p.id, p])));
      });
  }, [board]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>;

  return (
    <main className="min-h-screen text-[#0F172A] lg:pl-56">
      <NavBar activePath="/auction" />

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-2">
          <h1 className={`${anton.className} text-4xl sm:text-5xl uppercase tracking-tight leading-none text-[#0F172A]`}>
            Auction Draft
          </h1>
        </div>
        <p className="text-gray-500 text-center mb-8 max-w-xl mx-auto">
          Auction values as a % of a $200 budget, plus each creator&apos;s team-build strategy for the format.
        </p>

        {!isSubscribed && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8 text-center">
            <p className="text-amber-600 font-semibold text-lg mb-1">🔒 Auction Draft is a subscriber tool</p>
            <p className="text-gray-500 text-sm mb-4">Subscribe to view auction rankings and team-build strategy.</p>
            <a
              href="/subscribe"
              className="bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-bold px-6 py-2.5 rounded-xl inline-block transition-all"
            >
              {promoActive ? <>Subscribe — <PromoPrice /></> : "Subscribe — $10/mo"}
            </a>
          </div>
        )}

        {isSubscribed && (
          <>
            <div className="flex items-center justify-center gap-2.5 mb-4">
              {FORMATS.map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className={`px-4 py-1.5 rounded-full text-sm font-extrabold uppercase tracking-wide shadow-md transition-all ${
                    format === f ? "bg-[#2563EB] text-white shadow-blue-600/30" : "bg-gray-200 text-gray-500 shadow-gray-400/10 hover:bg-gray-300"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {boardLoading ? (
              <p className="text-sm text-gray-400 text-center py-12">Loading...</p>
            ) : !board?.players?.length ? (
              <div className="bg-white/70 backdrop-blur-md rounded-xl border border-white/80 shadow-lg p-8 text-center">
                <p className="text-gray-400 text-sm">This creator hasn&apos;t published {format} auction rankings yet.</p>
              </div>
            ) : (
              <>
                <div className="bg-white/70 backdrop-blur-md rounded-xl border border-white/80 shadow-lg mb-6 overflow-hidden">
                  <button
                    onClick={() => setTeamBuildOpen((v) => !v)}
                    className="w-full flex items-center justify-between px-5 py-3.5 text-left"
                  >
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Team Build</h3>
                    <svg
                      viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      className={`w-4 h-4 text-gray-400 transition-transform ${teamBuildOpen ? "rotate-180" : ""}`}
                    >
                      <path d="M5 7.5l5 5 5-5" />
                    </svg>
                  </button>
                  {teamBuildOpen && (
                    <div className="px-5 pb-5">
                      {board.teamBuildDescription ? (
                        <p className="text-sm text-[#0F172A] whitespace-pre-wrap leading-relaxed">{board.teamBuildDescription}</p>
                      ) : (
                        <p className="text-sm text-gray-400">Strategy write-up coming soon.</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="rounded-xl overflow-hidden border border-gray-100 bg-white/70 backdrop-blur-md shadow-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium w-12">#</th>
                        <th className="text-left px-4 py-2.5 font-medium">Player</th>
                        <th className="text-right px-4 py-2.5 font-medium">% of Budget</th>
                      </tr>
                    </thead>
                    <tbody>
                      {board.players.map((row, i) => {
                        const p = playersById[row.player_id];
                        return (
                          <tr key={row.player_id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{i + 1}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2.5">
                                <PlayerHeadshot espnId={p?.espn_id} sleeperId={p?.sleeper_id} name={p?.name} size="sm" />
                                <div className="min-w-0">
                                  <p className="font-medium text-[#0F172A] truncate">{p?.name || `Player #${row.player_id}`}</p>
                                  <p className="text-xs text-gray-400">{p?.position} · {p?.team}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold text-[#0F172A]">{formatPct(row.pct)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
