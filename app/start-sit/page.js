"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import NavBar from "@/app/components/NavBar";
import PageTitle from "@/app/components/PageTitle";
import PillToggle from "@/app/components/PillToggle";
import PlayerHeadshot from "@/app/components/PlayerHeadshot";
import PromoPrice from "@/app/components/PromoPrice";
import { isPromoActive } from "@/lib/promo";
import { getViewMode } from "@/lib/viewMode";

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

function PlayerPicker({ label, player, onSelect, onClear, token }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      fetch(`/api/start-sit/search?q=${encodeURIComponent(query.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => (r.ok ? r.json() : { players: [] }))
        .then((d) => setResults(d.players || []))
        .catch(() => setResults([]));
    }, 150);
    return () => clearTimeout(handle);
  }, [query, token]);

  useEffect(() => {
    function handleClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (player) {
    return (
      <div className="bg-card/70 backdrop-blur-md rounded-xl border border-card/80 shadow-lg p-3 sm:p-4 flex items-center gap-2.5 sm:gap-3">
        <PlayerHeadshot espnId={player.espn_id} sleeperId={player.sleeper_id} name={player.name} size="md" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink text-sm sm:text-base truncate">{player.name}</p>
          <p className="text-xs text-gray-400">{player.position} · {player.team}</p>
        </div>
        <button onClick={onClear} className="text-gray-400 hover:text-gray-600 text-xs sm:text-sm font-medium shrink-0">
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
        className="w-full bg-card/70 backdrop-blur-md rounded-xl border border-card/80 shadow-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
      />
      {open && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-card rounded-xl border border-gray-200 shadow-xl max-h-72 overflow-y-auto">
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => { onSelect(p); setQuery(""); setResults([]); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 text-left"
            >
              <PlayerHeadshot espnId={p.espn_id} sleeperId={p.sleeper_id} name={p.name} size="sm" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink truncate">{p.name}</p>
                <p className="text-xs text-gray-400">{p.position} · {p.team}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      {open && query.trim().length >= 1 && results.length === 0 && (
        <div className="absolute z-10 mt-1 w-full bg-card rounded-xl border border-gray-200 shadow-xl px-4 py-3 text-sm text-gray-400">
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
  const glow = hasGame && hasRecommendation ? color : null;
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="rounded-xl transition-shadow"
        style={glow ? { boxShadow: `0 0 0 3px ${glow}55, 0 0 22px 4px ${glow}70` } : undefined}
      >
        <PlayerHeadshot espnId={player.espn_id} sleeperId={player.sleeper_id} name={player.name} size="xl" shape="square" teamColor={color} />
      </div>
      <p className="font-bold text-sm text-ink text-center max-w-[7rem] truncate">{player.name}</p>
      {label && (
        <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${labelCls}`}>
          {label}
        </span>
      )}
    </div>
  );
}

function ProjectionCard({ result, opponentLabel, isRecommended, hasRecommendation }) {
  const { player, hasGame, gameStartsAt, homeAway, projection, missingStats, gameTotal, teamImpliedTotal } = result;
  const glow = hasGame && hasRecommendation ? (isRecommended ? "#16A34A" : "#DC2626") : null;
  return (
    <div
      className="bg-card/70 backdrop-blur-md rounded-xl border border-card/80 shadow-lg p-4 sm:p-5 relative transition-shadow"
      style={glow ? { boxShadow: `0 0 0 2px ${glow}55, 0 0 28px 6px ${glow}45` } : undefined}
    >
      <div className="flex items-center gap-2.5 sm:gap-3 mb-3 sm:mb-4">
        <PlayerHeadshot espnId={player.espn_id} sleeperId={player.sleeper_id} name={player.name} size="lg" />
        <div className="min-w-0">
          <p className="font-bold text-ink text-base sm:text-lg truncate">{player.name}</p>
          <p className="text-xs text-gray-400">{player.position} · {player.team}</p>
        </div>
      </div>

      {!hasGame ? (
        <p className="text-sm text-gray-400 py-6 text-center">No upcoming prop lines yet for this player.</p>
      ) : (
        <>
          <p className="text-xs text-gray-400 mb-1">
            {homeAway === "home" ? "vs" : "@"} {opponentLabel} · {new Date(gameStartsAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </p>
          {(gameTotal || teamImpliedTotal) && (
            <p className="text-xs text-gray-400 mb-3">
              {gameTotal && <>O/U {gameTotal}</>}
              {gameTotal && teamImpliedTotal && " · "}
              {teamImpliedTotal && <>Implied {teamImpliedTotal}</>}
            </p>
          )}
          <div className="text-center mb-4">
            <p className="text-3xl font-extrabold text-ink">{projection.total}</p>
            <p className="text-xs text-gray-400">projected fantasy points</p>
          </div>
          {missingStats?.length > 0 && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-3 text-center">
              Partial data — {missingStats.join(", ")} not posted yet
            </p>
          )}
          <div className="divide-y divide-gray-100">
            {projection.breakdown.map((b) => (
              <div key={b.statId} className="flex items-center gap-2 py-1.5 text-xs sm:text-sm">
                <span className={`flex-1 min-w-0 flex items-center gap-1 ${b.winsStat ? "text-green-700 font-medium" : "text-gray-500"}`}>
                  {b.winsStat && <span className="text-green-600 shrink-0">▲</span>}
                  <span className="truncate">{b.label}</span>
                </span>
                <span className={`w-12 sm:w-14 shrink-0 text-right font-mono tabular-nums text-[10px] sm:text-xs ${b.winsStat ? "text-green-700 font-semibold" : "text-gray-400"}`}>
                  {b.display ?? b.line}
                </span>
                <span className="w-14 sm:w-16 shrink-0 text-right font-semibold text-ink tabular-nums">
                  {b.points} pt{b.points === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Gate popup for the two blocked states: signed-out visitors (need a free
// account) and free-tier accounts that are out of vouchers for the month.
// Structure/styling mirrors the SignupModal in app/picks/page.js.
function AccessGateModal({ mode, onClose, promoActive }) {
  const [authMode, setAuthMode] = useState("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    if (!email || !password) return;
    setLoading(true);
    setMessage("");
    const supabase = createClient();
    if (authMode === "signup") {
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
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-card rounded-2xl shadow-2xl p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="4" y1="4" x2="16" y2="16" /><line x1="16" y1="4" x2="4" y2="16" />
          </svg>
        </button>

        {mode === "upgrade" ? (
          <div className="text-center py-2">
            <p className="text-4xl mb-3">🔒</p>
            <h2 className="text-lg font-bold text-ink mb-2">Out of free comparisons</h2>
            <p className="text-sm text-gray-500 max-w-xs mx-auto mb-6">
              You&rsquo;ve used all 3 free Start/Sit comparisons this month. Upgrade for unlimited access.
            </p>
            <Link
              href="/subscribe"
              className="bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-bold px-6 py-2.5 rounded-xl inline-block transition-all text-sm"
            >
              {promoActive ? <>Upgrade — <PromoPrice /></> : "Upgrade — $10/mo"}
            </Link>
            <button onClick={onClose} className="block mx-auto mt-4 text-sm text-gray-400 hover:text-gray-600 font-medium">
              Maybe later
            </button>
          </div>
        ) : done ? (
          <div className="text-center py-2">
            <p className="text-4xl mb-3">📬</p>
            <h2 className="text-lg font-bold text-ink mb-2">Check your email</h2>
            <p className="text-sm text-gray-500 max-w-xs mx-auto">
              We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then come back to use Start/Sit.
            </p>
            <button onClick={onClose} className="mt-6 text-sm text-blue-600 hover:text-blue-700 font-medium">
              Got it, close
            </button>
          </div>
        ) : (
          <>
            <div className="mb-5 pr-6">
              <h2 className="text-xl font-bold text-ink">
                {authMode === "signup" ? "Start/Sit needs a free account" : "Welcome back"}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {authMode === "signup"
                  ? "Create a free account to start using Start/Sit."
                  : "Sign in to use Start/Sit."}
              </p>
            </div>

            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1.5">Email</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="you@example.com" autoFocus
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs text-gray-500 mb-1.5">Password</label>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-ink focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
              {loading ? "Loading…" : authMode === "signup" ? "Create Free Account" : "Sign In"}
            </button>

            <p className="text-center text-xs text-gray-500 mt-4">
              {authMode === "signup" ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                onClick={() => { setAuthMode(authMode === "signup" ? "signin" : "signup"); setMessage(""); }}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                {authMode === "signup" ? "Sign in" : "Sign up"}
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function StartSitPage() {
  const promoActive = isPromoActive();
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [realIsDashboardUser, setRealIsDashboardUser] = useState(false);
  const [viewMode, setViewModeState] = useState("real");
  const [activeCreatorIds, setActiveCreatorIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [remaining, setRemaining] = useState(null);
  const [gateModal, setGateModal] = useState(null); // "signup" | "upgrade" | null

  const [scoring, setScoring] = useState("ppr");
  const [playerA, setPlayerA] = useState(null);
  const [playerB, setPlayerB] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user || null;
      setUser(user);
      setAccessToken(session?.access_token || null);

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
      const realIsDashboardUserNow = !!(ownProfileResult.data && (ownProfileResult.data.role === "admin" || ownProfileResult.data.is_creator));
      setRealIsDashboardUser(realIsDashboardUserNow);
      const cookieViewMode = getViewMode();
      setViewModeState(cookieViewMode);
      setActiveCreatorIds((activeCreatorsResult.creators || []).map((c) => c.creator_id));

      // Same isSubscribed formula as below (including the view-mode
      // simulation) — computed here too since state updates above aren't
      // visible until the next render.
      const effectiveViewModeNow = realIsDashboardUserNow ? cookieViewMode : "real";
      const isDashboardUserNow = effectiveViewModeNow === "real" ? realIsDashboardUserNow : false;
      const isFlatAccessGrantedNow = subResult.data?.plan_type === "flat_access"
        && subResult.data?.status === "active"
        && (activeCreatorsResult.creators || []).length > 0;
      const isSubscribedRawNow = isDashboardUserNow
        || (!!subResult.data && subResult.data.plan_type !== "flat_access" && subResult.data.status === "active")
        || isFlatAccessGrantedNow;
      const isSubscribedNow = effectiveViewModeNow === "subscriber" ? true : effectiveViewModeNow === "free" ? false : isSubscribedRawNow;

      if (user && !isSubscribedNow) {
        fetch("/api/start-sit/usage", { headers: { Authorization: `Bearer ${session.access_token}` } })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => { if (d) setRemaining(d.remaining); })
          .catch(() => {});
      }

      setLoading(false);
    }
    load();
  }, []);

  // Simulated preview for staff (see lib/viewMode.js) — a non-staff user's
  // view_mode cookie is ignored since effectiveViewMode only reads it when
  // realIsDashboardUser (the server-verified profiles lookup) is true.
  const effectiveViewMode = realIsDashboardUser ? viewMode : "real";
  const isDashboardUser = effectiveViewMode === "real" ? realIsDashboardUser : false;

  const isFlatAccessGranted = subscription?.plan_type === "flat_access"
    && subscription?.status === "active"
    && activeCreatorIds.length > 0;
  const isSubscribedRaw = isDashboardUser
    || (!!subscription && subscription.plan_type !== "flat_access" && subscription.status === "active")
    || isFlatAccessGranted;
  const isSubscribed = effectiveViewMode === "subscriber" ? true : effectiveViewMode === "free" ? false : isSubscribedRaw;

  // Creators/admins get the tool now as beta testers; regular subscribers see a
  // "coming soon" notice until public launch.
  const isBetaTester = isDashboardUser;
  const isPubliclyLive = new Date() >= START_SIT_LAUNCH_DATE;
  const hasFullAccess = isBetaTester || (isSubscribed && isPubliclyLive);
  const isPreLaunchSubscriber = isSubscribed && !isBetaTester && !isPubliclyLive;

  // Free-tier accounts: full tool UI gated by remaining vouchers rather than
  // a subscription. `remaining === null` while the usage check is in flight —
  // default to showing the tool rather than flashing a locked banner.
  const isFreeTierWithVouchers = !!user && !isSubscribed && (remaining === null || remaining > 0);
  const isFreeTierOutOfVouchers = !!user && !isSubscribed && remaining === 0;

  useEffect(() => {
    if (!playerA || !playerB || !accessToken) { setComparison(null); return; }
    setComparing(true);
    fetch(`/api/start-sit/compare?playerIds=${playerA.id},${playerB.id}&scoring=${scoring}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (r) => {
        if (r.status === 403) {
          setRemaining(0);
          setGateModal("upgrade");
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((data) => {
        setComparison(data);
        if (data && data.remaining !== null && data.remaining !== undefined) setRemaining(data.remaining);
      })
      .catch(() => setComparison(null))
      .finally(() => setComparing(false));
  }, [playerA, playerB, scoring, accessToken]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>;

  return (
    <main className="min-h-screen text-ink lg:pl-56">
      <NavBar activePath="/start-sit" />

      <div className="max-w-4xl mx-auto px-6 py-12">
        <PageTitle title="Start/Sit" subtitle="Tool" />
        <p className="text-gray-500 text-center mb-8 max-w-xl mx-auto">
          Fantasy point projections built from live sportsbook player prop lines — pick two players and see who projects higher.
        </p>

        {isPreLaunchSubscriber && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8 text-center">
            <p className="text-blue-700 font-semibold text-lg mb-1">🚀 This tool will be live September 5th</p>
            <p className="text-gray-500 text-sm">Start/Sit is finishing up beta testing with our creators — check back soon.</p>
          </div>
        )}

        {!user && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8 text-center">
            <p className="text-amber-600 font-semibold text-lg mb-1">🔒 Start/Sit requires a free account</p>
            <p className="text-gray-500 text-sm mb-4">Create a free account to start using Start/Sit.</p>
            <button
              onClick={() => setGateModal("signup")}
              className="bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-bold px-6 py-2.5 rounded-xl inline-block transition-all"
            >
              Sign Up Free
            </button>
          </div>
        )}

        {isFreeTierOutOfVouchers && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8 text-center">
            <p className="text-amber-600 font-semibold text-lg mb-1">🔒 Out of free comparisons</p>
            <p className="text-gray-500 text-sm mb-4">You&rsquo;ve used all 3 free Start/Sit comparisons this month.</p>
            <button
              onClick={() => setGateModal("upgrade")}
              className="bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-bold px-6 py-2.5 rounded-xl inline-block transition-all"
            >
              {promoActive ? <>Upgrade — <PromoPrice /></> : "Upgrade — $10/mo"}
            </button>
          </div>
        )}

        {(hasFullAccess || isFreeTierWithVouchers) && (
          <>
            {isBetaTester && !isPubliclyLive && (
              <p className="text-xs text-blue-600 font-semibold mb-4">🧪 Beta preview — live for subscribers September 5th</p>
            )}
            {!isSubscribed && remaining !== null && (
              <p className="text-center text-xs text-gray-500 mb-4">
                {remaining} of 3 free comparisons left this month
              </p>
            )}
            <PillToggle options={SCORING_OPTIONS} value={scoring} onChange={setScoring} className="mb-8" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              <PlayerPicker label="Player A" player={playerA} onSelect={setPlayerA} onClear={() => setPlayerA(null)} token={accessToken} />
              <PlayerPicker label="Player B" player={playerB} onSelect={setPlayerB} onClear={() => setPlayerB(null)} token={accessToken} />
            </div>

            {comparing && <p className="text-sm text-gray-400 text-center py-8">Loading projections...</p>}

            {!comparing && comparison && !comparison.error && (
              <>
                <div className="flex items-start justify-center gap-6 sm:gap-14 mb-8">
                  {comparison.players.map((result) => (
                    <PlayerSummaryCard
                      key={result.player.id}
                      result={result}
                      isRecommended={comparison.recommendedPlayerId === result.player.id}
                      hasRecommendation={!!comparison.recommendedPlayerId}
                    />
                  ))}
                </div>

                {comparison.confidence !== null && comparison.confidence !== undefined && (
                  <div className="flex justify-center mb-6">
                    <span className="inline-flex items-center gap-1.5 bg-card/70 backdrop-blur-md border border-card/80 shadow-lg rounded-full px-4 py-1.5 text-sm">
                      <span className="text-gray-400">Confidence:</span>
                      <span className="font-bold text-ink">{comparison.confidence}%</span>
                    </span>
                  </div>
                )}

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
                        isRecommended={comparison.recommendedPlayerId === result.player.id}
                        hasRecommendation={!!comparison.recommendedPlayerId}
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
              <p className="text-xs text-gray-400 mb-3">Projections are derived from the fairest-priced line across major sportsbooks. Check live odds:</p>
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

      {gateModal && (
        <AccessGateModal mode={gateModal} onClose={() => setGateModal(null)} promoActive={promoActive} />
      )}
    </main>
  );
}
