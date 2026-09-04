"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";
import NavBar from "@/app/components/NavBar";
import PageTitle from "@/app/components/PageTitle";
import PillToggle from "@/app/components/PillToggle";
import PlayerHeadshot from "@/app/components/PlayerHeadshot";
import PromoPrice from "@/app/components/PromoPrice";
import { isPromoActive } from "@/lib/promo";

const START_SIT_LAUNCH_DATE = new Date("2026-09-05T00:00:00-04:00");

const SCORING_OPTIONS = [
  { id: "ppr", label: "PPR" },
  { id: "half_ppr", label: "0.5 PPR" },
  { id: "standard", label: "Standard" },
];

// Brand-color badges rather than scraped/reproduced sportsbook logo artwork,
// which we don't hold rights to embed.
const SPORTSBOOKS = [
  { name: "DraftKings", url: "https://sportsbook.draftkings.com", bg: "#053213", text: "#53D337" },
  { name: "FanDuel", url: "https://sportsbook.fanduel.com", bg: "#1493FF", text: "#FFFFFF" },
  { name: "BetMGM", url: "https://sports.betmgm.com", bg: "#B4975A", text: "#111111" },
];

function PlayerPicker({ label, player, onSelect, onClear }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      fetch(`/api/start-sit/search?q=${encodeURIComponent(query.trim())}`)
        .then((r) => (r.ok ? r.json() : { players: [] }))
        .then((d) => setResults(d.players || []))
        .catch(() => setResults([]));
    }, 150);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    function handleClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (player) {
    return (
      <div className="bg-white/70 backdrop-blur-md rounded-xl border border-white/80 shadow-lg p-4 flex items-center gap-3">
        <PlayerHeadshot espnId={player.espn_id} sleeperId={player.sleeper_id} name={player.name} size="md" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-[#0F172A] truncate">{player.name}</p>
          <p className="text-xs text-gray-400">{player.position} · {player.team}</p>
        </div>
        <button onClick={onClear} className="text-gray-400 hover:text-gray-600 text-sm font-medium shrink-0">
          Change
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search a player with an upcoming game..."
        className="w-full bg-white/70 backdrop-blur-md rounded-xl border border-white/80 shadow-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
      />
      {open && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-xl max-h-72 overflow-y-auto">
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => { onSelect(p); setQuery(""); setResults([]); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 text-left"
            >
              <PlayerHeadshot espnId={p.espn_id} sleeperId={p.sleeper_id} name={p.name} size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#0F172A] truncate">{p.name}</p>
                <p className="text-xs text-gray-400">{p.position} · {p.team}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && query.trim().length >= 1 && results.length === 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-xl px-4 py-3 text-sm text-gray-400">
          No players with an upcoming game match &ldquo;{query}&rdquo;.
        </div>
      )}
    </div>
  );
}

// Quick visual summary — green/red photo treatment — shown above the detailed
// per-stat breakdown once both players have been compared.
function PlayerSummaryCard({ result, isRecommended, hasRecommendation }) {
  const { player, hasGame } = result;
  const color = !hasGame ? "#9CA3AF" : isRecommended ? "#16A34A" : hasRecommendation ? "#DC2626" : "#9CA3AF";
  const label = !hasGame ? "No Data" : isRecommended ? "Start" : hasRecommendation ? "Sit" : "";
  const labelCls = !hasGame || !hasRecommendation
    ? "bg-gray-100 text-gray-500"
    : isRecommended
      ? "bg-green-100 text-green-700"
      : "bg-red-100 text-red-600";
  return (
    <div className="flex flex-col items-center gap-2">
      <PlayerHeadshot espnId={player.espn_id} sleeperId={player.sleeper_id} name={player.name} size="xl" shape="square" teamColor={color} />
      <p className="font-bold text-sm text-[#0F172A] text-center max-w-[7rem] truncate">{player.name}</p>
      {label && (
        <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${labelCls}`}>
          {label}
        </span>
      )}
    </div>
  );
}

function ProjectionCard({ result, opponentLabel }) {
  const { player, hasGame, gameStartsAt, homeAway, projection } = result;
  return (
    <div className="bg-white/70 backdrop-blur-md rounded-xl border border-white/80 shadow-lg p-5 relative">
      <div className="flex items-center gap-3 mb-4">
        <PlayerHeadshot espnId={player.espn_id} sleeperId={player.sleeper_id} name={player.name} size="lg" />
        <div className="min-w-0">
          <p className="font-bold text-[#0F172A] text-lg truncate">{player.name}</p>
          <p className="text-xs text-gray-400">{player.position} · {player.team}</p>
        </div>
      </div>

      {!hasGame ? (
        <p className="text-sm text-gray-400 py-6 text-center">No upcoming prop lines yet for this player.</p>
      ) : (
        <>
          <p className="text-xs text-gray-400 mb-3">
            {homeAway === "home" ? "vs" : "@"} {opponentLabel} · {new Date(gameStartsAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </p>
          <div className="text-center mb-4">
            <p className="text-3xl font-extrabold text-[#0F172A]">{projection.total}</p>
            <p className="text-xs text-gray-400">projected fantasy points</p>
          </div>
          <div className="divide-y divide-gray-100">
            {projection.breakdown.map((b) => (
              <div key={b.statId} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-gray-500">{b.label}</span>
                <span className="text-gray-400 font-mono text-xs">{b.line}</span>
                <span className="font-semibold text-[#0F172A]">{b.points} pt{b.points === 1 ? "" : "s"}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function StartSitPage() {
  const promoActive = isPromoActive();
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [isDashboardUser, setIsDashboardUser] = useState(false);
  const [activeCreatorIds, setActiveCreatorIds] = useState([]);
  const [loading, setLoading] = useState(true);

  const [scoring, setScoring] = useState("ppr");
  const [playerA, setPlayerA] = useState(null);
  const [playerB, setPlayerB] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [comparing, setComparing] = useState(false);

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

  // Creators/admins get the tool now as beta testers; regular subscribers see a
  // "coming soon" notice until public launch.
  const isBetaTester = isDashboardUser;
  const isPubliclyLive = new Date() >= START_SIT_LAUNCH_DATE;
  const hasFullAccess = isBetaTester || (isSubscribed && isPubliclyLive);
  const isPreLaunchSubscriber = isSubscribed && !isBetaTester && !isPubliclyLive;

  useEffect(() => {
    if (!playerA || !playerB) { setComparison(null); return; }
    setComparing(true);
    fetch(`/api/start-sit/compare?playerIds=${playerA.id},${playerB.id}&scoring=${scoring}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setComparison)
      .catch(() => setComparison(null))
      .finally(() => setComparing(false));
  }, [playerA, playerB, scoring]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>;

  return (
    <main className="min-h-screen text-[#0F172A] lg:pl-56">
      <NavBar activePath="/start-sit" />

      <div className="max-w-4xl mx-auto px-6 py-12">
        <PageTitle title="Start/Sit" subtitle="Tool" />
        <p className="text-gray-500 text-center mb-8 max-w-xl mx-auto">
          Fantasy point projections built from live DraftKings player prop lines — pick two players and see who projects higher.
        </p>

        {isPreLaunchSubscriber && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8 text-center">
            <p className="text-blue-700 font-semibold text-lg mb-1">🚀 This tool will be live September 5th</p>
            <p className="text-gray-500 text-sm">Start/Sit is finishing up beta testing with our creators — check back soon.</p>
          </div>
        )}

        {!isSubscribed && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8 text-center">
            <p className="text-amber-600 font-semibold text-lg mb-1">🔒 Start/Sit is a subscriber tool</p>
            <p className="text-gray-500 text-sm mb-4">Subscribe to compare players and see full projections.</p>
            <a
              href="/subscribe"
              className="bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-bold px-6 py-2.5 rounded-xl inline-block transition-all"
            >
              {promoActive ? <>Subscribe — <PromoPrice /></> : "Subscribe — $10/mo"}
            </a>
          </div>
        )}

        {hasFullAccess && (
          <>
            {isBetaTester && !isPubliclyLive && (
              <p className="text-xs text-blue-600 font-semibold mb-4">🧪 Beta preview — live for subscribers September 5th</p>
            )}
            <PillToggle options={SCORING_OPTIONS} value={scoring} onChange={setScoring} className="mb-8" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              <PlayerPicker label="Player A" player={playerA} onSelect={setPlayerA} onClear={() => setPlayerA(null)} />
              <PlayerPicker label="Player B" player={playerB} onSelect={setPlayerB} onClear={() => setPlayerB(null)} />
            </div>

            {comparing && <p className="text-sm text-gray-400 text-center py-8">Loading projections...</p>}

            {!comparing && comparison && !comparison.error && (
              <>
                <div className="flex items-start justify-center gap-8 sm:gap-14 mb-8">
                  {comparison.players.map((result) => (
                    <PlayerSummaryCard
                      key={result.player.id}
                      result={result}
                      isRecommended={comparison.recommendedPlayerId === result.player.id}
                      hasRecommendation={!!comparison.recommendedPlayerId}
                    />
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {comparison.players.map((result) => {
                    const opp = comparison.players.find((r) => r.player.id !== result.player.id);
                    const opponentLabel = result.opponentId
                      ? result.opponentId.replace(/_NFL$/, "").replaceAll("_", " ")
                      : opp?.player.team || "";
                    return (
                      <ProjectionCard
                        key={result.player.id}
                        result={result}
                        opponentLabel={opponentLabel}
                      />
                    );
                  })}
                </div>
              </>
            )}

            {!comparing && comparison?.error && (
              <p className="text-sm text-red-500 text-center py-8">{comparison.error}</p>
            )}

            <div className="mt-10 pt-6 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-400 mb-3">Projections are derived from DraftKings player prop lines. Check live odds:</p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {SPORTSBOOKS.map((b) => (
                  <a
                    key={b.name}
                    href={b.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ backgroundColor: b.bg, color: b.text }}
                    className="text-xs font-extrabold uppercase tracking-wide px-4 py-2 rounded-lg shadow-md hover:brightness-110 transition-all"
                  >
                    {b.name}
                  </a>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
