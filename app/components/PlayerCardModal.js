"use client";
import { useEffect, useState } from "react";
import PlayerHeadshot from "@/app/components/PlayerHeadshot";
import { anton } from "@/lib/fonts";
import { riskColor } from "@/lib/riskColor";
import { teamColors } from "@/lib/teamColors";
import { expandIds, normalizeName, computeConsensus } from "@/lib/rankingsHelpers";
import { MATCHUP_TIER_CLASSES, MATCHUP_TIER_LABELS } from "@/lib/matchupStrength";

const WAIVER_CATEGORY_LABELS = { priority: "Priority Add", drop: "Drop/Cut", streamer: "Streamer" };

// Vivid variants for the modal's dark banner, where the page's light
// posColors backgrounds would have poor contrast.
const posBannerColors = {
  WR: "bg-blue-400",
  RB: "bg-green-500",
  QB: "bg-red-500",
  TE: "bg-amber-500",
};

// Lightens (positive percent) or darkens (negative) a hex color.
function shadeColor(hex, percent) {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const r = Math.max(0, Math.min(255, (num >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amt));
  const b = Math.max(0, Math.min(255, (num & 0x0000ff) + amt));
  return `#${(0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1)}`;
}

// Picks readable black/white text for an arbitrary background color.
function contrastText(hex) {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#0F172A" : "#FFFFFF";
}

function modalBannerGradient(team) {
  const { primary } = teamColors(team);
  return `linear-gradient(to bottom, ${shadeColor(primary, 10)} 0%, ${primary} 50%, ${shadeColor(primary, -18)} 100%)`;
}

function hexToRgba(hex, alpha) {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Position-appropriate stat line for the "previous season" card section —
// no point showing pass attempts on a WR or targets on a QB.
function seasonStatLine(position, stats, perGame, gamesPlayed) {
  if (!stats) return [];
  const gp = gamesPlayed > 0 ? gamesPlayed : 1;
  const n = (v) => {
    if (v === null || v === undefined) return v;
    if (!perGame) return v;
    return Math.round((v / gp) * 10) / 10;
  };
  if (position === "QB") {
    return [
      { label: "Comp/Att", value: `${n(stats.pass_cmp)}/${n(stats.pass_att)}` },
      { label: "Pass Yds", value: n(stats.pass_yd) },
      { label: "Pass TD", value: n(stats.pass_td) },
      { label: "INT", value: n(stats.pass_int) },
      { label: "Rush Yds", value: n(stats.rush_yd) },
      { label: "Rush TD", value: n(stats.rush_td) },
    ];
  }
  if (position === "RB") {
    return [
      { label: "Rush Att", value: n(stats.rush_att) },
      { label: "Rush Yds", value: n(stats.rush_yd) },
      { label: "Rush TD", value: n(stats.rush_td) },
      { label: "Rec", value: n(stats.rec) },
      { label: "Targets", value: n(stats.rec_tgt) },
      { label: "Rec Yds", value: n(stats.rec_yd) },
      { label: "Rec TD", value: n(stats.rec_td) },
    ];
  }
  // WR / TE
  const line = [
    { label: "Rec", value: n(stats.rec) },
    { label: "Targets", value: n(stats.rec_tgt) },
    { label: "Rec Yds", value: n(stats.rec_yd) },
    { label: "Rec TD", value: n(stats.rec_td) },
  ];
  if (stats.rush_att > 0) {
    line.push({ label: "Rush Yds", value: n(stats.rush_yd) }, { label: "Rush TD", value: n(stats.rush_td) });
  }
  return line;
}

// Compact per-position column set for the game log table — fewer stats than
// seasonStatLine's full breakdown above, since these sit as table columns
// next to Week/Opp/FPTS rather than standalone chips.
const GAME_LOG_COLUMNS = {
  QB: [
    { key: "pass_yd", label: "PASS YD" },
    { key: "pass_td", label: "PASS TD" },
    { key: "pass_int", label: "INT" },
    { key: "rush_yd", label: "RUSH YD" },
    { key: "rush_td", label: "RUSH TD" },
  ],
  RB: [
    { key: "rush_yd", label: "RUSH YD" },
    { key: "rush_td", label: "RUSH TD" },
    { key: "rec", label: "REC" },
    { key: "rec_yd", label: "REC YD" },
    { key: "rec_td", label: "REC TD" },
  ],
  WR: [
    { key: "rec", label: "REC" },
    { key: "rec_yd", label: "REC YD" },
    { key: "rec_td", label: "REC TD" },
  ],
  TE: [
    { key: "rec", label: "REC" },
    { key: "rec_yd", label: "REC YD" },
    { key: "rec_td", label: "REC TD" },
  ],
};

// Rough, widely-used weekly thresholds for "was this stat clearly good,
// average, or clearly bad at a glance" — not scientific, just the numbers
// fantasy analysis generally treats as a strong, middling, or weak showing.
// Every stat now gets a real `bad` floor too (0 for TDs/INTs included) so
// the game log can render a genuine 3-way good/mid/bad read on each cell
// instead of only calling out the good games.
const STAT_QUALITY = {
  pass_yd: { good: 275, bad: 175 },
  pass_td: { good: 3, bad: 1 },
  pass_int: { good: 0, bad: 2, lowerIsBetter: true },
  rush_yd: { good: 90, bad: 30 },
  rush_td: { good: 2, bad: 0 },
  rec: { good: 7, bad: 2 },
  rec_yd: { good: 90, bad: 25 },
  rec_td: { good: 2, bad: 0 },
};

// Fixed hex colors rather than named Tailwind shades — this site remaps the
// entire red/green/amber palette for dark mode by swapping light and dark
// shades (see the `.dark` block in app/globals.css and the same fix in
// lib/matchupStrength.js), so a "good/bad" chip built from bg-green-500/
// bg-red-500 can silently invert once dark mode is live. These read the
// same in both themes.
const QUALITY_CHIP_CLASSES = {
  good: "bg-[#16A34A] text-white",
  mid: "bg-[#F1F5F9] text-[#4B5563]",
  bad: "bg-[#DC2626] text-white",
};

function statQualityTier(key, value) {
  const t = STAT_QUALITY[key];
  if (!t || value === null || value === undefined) return null;
  const v = Number(value);
  if (t.lowerIsBetter) {
    if (v <= t.good) return "good";
    if (t.bad !== undefined && v >= t.bad) return "bad";
    return "mid";
  }
  if (v >= t.good) return "good";
  if (t.bad !== undefined && v <= t.bad) return "bad";
  return "mid";
}

// A small colored chip for one game-log cell — shared by both the raw stat
// columns and the weekly positional-finish column below, so the whole row
// reads as one consistent good/mid/bad visual language.
function StatChip({ tier, children, bold }) {
  if (!tier) return <span className="text-[#9CA3AF]">{children}</span>;
  return (
    <span
      className={`inline-flex items-center justify-center min-w-[2.25rem] px-1.5 py-0.5 rounded ${bold ? "font-bold" : "font-semibold"} ${QUALITY_CHIP_CLASSES[tier]}`}
    >
      {children}
    </span>
  );
}

// Same idea for the RK/FPTS columns, but keyed off positional finish rather
// than a raw stat — a finish rank already accounts for position/scoring
// scale, so it's a cleaner "was this a good fantasy week" signal than a
// fixed FPTS number would be across positions that score very differently.
// The season currently in progress — bump this once the 2027 season starts.
// Matches the constant in app/api/player-stats/route.js.
const CURRENT_SEASON = 2026;
const SEASON_TABS = [2026, 2025, 2024, 2023];

// SGO's opponent ids are their own team-name strings (e.g.
// "KANSAS_CITY_CHIEFS_NFL"), not this app's team codes — same transform
// app/start-sit/page.js already uses to make them readable.
function opponentLabelFor(opponentId) {
  return opponentId ? opponentId.replace(/_NFL$/, "").replaceAll("_", " ") : "TBD";
}

function finishQualityTier(rank) {
  if (rank == null) return null;
  if (rank <= 12) return "good";
  if (rank >= 25) return "bad";
  return "mid";
}

// Plain colored text (no chip background) for FPTS — it's the headline
// number in the row, so it stays the biggest/boldest thing rather than
// getting boxed in like the shorter stat/finish cells next to it.
const QUALITY_TEXT_CLASSES = {
  good: "text-[#16A34A]",
  mid: "text-[#0F172A]",
  bad: "text-[#DC2626]",
};

// Player profile modal — deliberately owns its own data-loading state
// (season stats, waiver mentions, rankings-by-format) rather than lifting it
// into the Rankings page. Those requests resolve ~300-500ms after opening,
// and when that state lived in the (very large) parent page, each resolution
// re-rendered the entire rankings table along with it, producing a visible
// stutter partway through this modal's own open animation. Keeping it local
// means those updates only ever re-render this component.
export default function PlayerCardModal({
  player,
  onClose,
  displayPosRanks,
  weeklyCurrentNflWeek,
  activeFormat,
  FORMATS,
  ACTIVE_CREATORS,
  playerPool,
  rankingsCache,
  onCacheFormat,
  // Risk rating — still page-owned (shared with the main rankings table's
  // creator-tab editing), passed straight through.
  isConsensusTab,
  displayedRisk,
  canEditRisk,
  creatorRatings,
  riskSaveStatus,
  activeCreator,
  onUpdateRiskLocal,
  onCommitRisk,
  onClearRisk,
}) {
  const [playerRankings, setPlayerRankings] = useState({});
  const [playerRankingsLoading, setPlayerRankingsLoading] = useState(true);
  const [seasonTotals, setSeasonTotals] = useState(null);
  const [seasonStatsLoading, setSeasonStatsLoading] = useState(true);
  const [gameLog, setGameLog] = useState([]);
  const [showAllGames, setShowAllGames] = useState(false);
  const [statsMode, setStatsMode] = useState("total"); // "total" | "perGame"
  const [logMode, setLogMode] = useState("weekly"); // "weekly" | "season"
  const [logSeason, setLogSeason] = useState(CURRENT_SEASON);
  const [waiverMentions, setWaiverMentions] = useState([]);
  const [waiverMentionsLoading, setWaiverMentionsLoading] = useState(true);
  const [nextGame, setNextGame] = useState(null);
  const [nextGameWeek, setNextGameWeek] = useState(null);
  const [huddleRank, setHuddleRank] = useState(null);
  const [nextGameLoading, setNextGameLoading] = useState(true);

  // player-stats (weekly log + season totals) is its own effect, keyed on
  // logSeason too, so switching the year tab re-fetches without re-running
  // the player-rankings/waiver-mentions fetches below (those don't depend
  // on which season is selected).
  useEffect(() => {
    let cancelled = false;
    setSeasonStatsLoading(true);
    setShowAllGames(false);

    fetch(`/api/player-stats?playerId=${player.id}&season=${logSeason}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setSeasonTotals(d?.seasonTotals || null);
        setGameLog(d?.gameLog || []);
      })
      .catch(() => { if (!cancelled) { setSeasonTotals(null); setGameLog([]); } })
      .finally(() => { if (!cancelled) setSeasonStatsLoading(false); });

    return () => { cancelled = true; };
  }, [player.id, logSeason]);

  useEffect(() => {
    let cancelled = false;

    setPlayerRankingsLoading(true);
    setPlayerRankings({});
    setStatsMode("total");
    setLogMode("weekly");
    setLogSeason(CURRENT_SEASON);
    setWaiverMentionsLoading(true);
    setWaiverMentions([]);
    setNextGameLoading(true);
    setNextGame(null);
    setNextGameWeek(null);
    setHuddleRank(null);

    fetch(`/api/waiver-wire?player_id=${player.id}&week=${weeklyCurrentNflWeek}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setWaiverMentions(d?.entries || []); })
      .catch(() => { if (!cancelled) setWaiverMentions([]); })
      .finally(() => { if (!cancelled) setWaiverMentionsLoading(false); });

    fetch(`/api/player-next-game?playerId=${player.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setNextGame(d?.nextGame || null);
        setNextGameWeek(d?.week ?? null);
        setHuddleRank(d?.huddleRank || null);
      })
      .catch(() => { if (!cancelled) { setNextGame(null); setHuddleRank(null); } })
      .finally(() => { if (!cancelled) setNextGameLoading(false); });

    (async () => {
      const rankingsData = {};
      const modalById = Object.fromEntries(playerPool.map(p => [p.id, p]));
      await Promise.all(FORMATS.map(async (fmt) => {
        let rawFormatData = rankingsCache[fmt];
        if (!rawFormatData) {
          try {
            const res = await fetch(`/api/rankings?format=${encodeURIComponent(fmt)}`);
            const { rankings } = await res.json();
            const fmtMap = {};
            for (const row of (rankings || [])) fmtMap[row.creator_id] = row.players || [];
            rawFormatData = fmtMap;
            onCacheFormat(fmt, fmtMap);
          } catch {
            rawFormatData = {};
          }
        }
        const expandedFmt = Object.fromEntries(
          Object.entries(rawFormatData).map(([cid, arr]) => [cid, expandIds(arr, modalById)])
        );
        const consensus = computeConsensus(expandedFmt);
        const pKey = normalizeName(player.name);
        const cIdx = consensus ? consensus.findIndex(p => normalizeName(p.name) === pKey) : -1;
        const rrIdx = (expandedFmt["rookierager"] || []).findIndex(p => normalizeName(p.name) === pKey);
        const ffIdx = (expandedFmt["ffhuddle"] || []).findIndex(p => normalizeName(p.name) === pKey);
        rankingsData[fmt] = {
          consensus: cIdx >= 0 ? cIdx + 1 : null,
          rookierager: rrIdx >= 0 ? rrIdx + 1 : null,
          ffhuddle: ffIdx >= 0 ? ffIdx + 1 : null,
        };
      }));
      if (!cancelled) {
        setPlayerRankings(rankingsData);
        setPlayerRankingsLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.id]);

  // Most recent week first — a fresh view defaults to recent form, not
  // week 1, which is what "top 3" is actually useful for as the season
  // goes on. "Show all" reveals the rest in the same order.
  const orderedGameLog = [...gameLog].reverse();
  const visibleGameLog = showAllGames ? orderedGameLog : orderedGameLog.slice(0, 3);

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-modal-backdrop"
      style={{ willChange: "opacity" }}
      onClick={onClose}
    >
      <div
        className="bg-card/95 rounded-3xl border border-card/80 ring-1 ring-white/10 w-full max-w-xl lg:max-w-[90vw] relative animate-modal-card"
        style={{
          boxShadow: `0 25px 60px -15px rgba(0,0,0,0.6), 0 0 70px 10px ${hexToRgba(teamColors(player.team).primary, 0.3)}`,
          willChange: "transform, opacity",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close — stays outside the scrollable body below so it's always reachable */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/20 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/30 transition-colors text-lg leading-none font-medium"
        >
          ✕
        </button>

        {/* Scrollable body — on mobile this content can be taller than the
            viewport, and the page behind is scroll-locked while the modal
            is open, so without its own scroll region the bottom of the
            card was simply unreachable. */}
        <div className="max-h-[85vh] overflow-y-auto rounded-3xl">

        {/* Header */}
        <div
          className="relative p-5 sm:p-8 rounded-t-3xl overflow-hidden flex items-end flex-wrap gap-4 sm:gap-5"
          style={{backgroundImage: modalBannerGradient(player.team)}}
        >
          {/* Glossy highlight for a premium sheen, independent of team color */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ backgroundImage: "radial-gradient(ellipse 120% 80% at 20% -10%, rgba(255,255,255,0.18), transparent 60%)" }}
          />
          <div className="relative rounded-xl ring-2 ring-white/25 shadow-xl shrink-0">
            <PlayerHeadshot espnId={player.pos === "DST" ? null : player.espn_id} sleeperId={player.pos === "DST" ? null : player.sleeper_id} name={player.name} size="2xl" shape="square" label={player.pos === "DST" ? player.team : null} />
          </div>
          <div className="relative pb-0.5 min-w-0 pr-8 sm:pr-0">
            <h2 className={`${anton.className} text-2xl sm:text-4xl text-white uppercase tracking-tight leading-none mb-2 truncate`}>{player.name}</h2>
            {(player.age || player.height_inches || player.weight_lbs) && (
              <p className="inline-flex items-center gap-1 bg-black/25 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1 rounded-full mb-2.5">
                {[
                  player.age ? `${player.age} YRS` : null,
                  player.height_inches ? `${Math.floor(player.height_inches / 12)}'${player.height_inches % 12}"` : null,
                  player.weight_lbs ? `${player.weight_lbs} LBS` : null,
                ].filter(Boolean).join(" · ")}
              </p>
            )}
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-lg text-sm font-semibold text-white ${posBannerColors[player.pos] || "bg-card/20"}`}>
                {displayPosRanks[player.name] || player.pos}
              </span>
              <span
                className="px-2.5 py-1 rounded-lg text-sm font-semibold"
                style={{ backgroundColor: teamColors(player.team).secondary, color: contrastText(teamColors(player.team).secondary) }}
              >
                {player.team}
              </span>
              {player.percent_rostered !== null && player.percent_rostered !== undefined && (
                <span className="px-2.5 py-1 rounded-lg text-sm font-semibold bg-white/15 text-white" title="% of ESPN leagues rostering this player">
                  {Math.round(player.percent_rostered)}% rost.
                </span>
              )}
            </div>
          </div>

          {/* Next Game — compact matchup card, same "one small box" layout
              as competitor sites: a header line (week + opponent) over a
              dotted-divider stat list, instead of separate tiles. Inherits
              items-end from the row, so it naturally sits bottom-right,
              clear of the close button pinned to the top-right corner. */}
          {(nextGameLoading || nextGame || huddleRank) && (
            <div className="relative ml-auto w-full sm:w-60 shrink-0 bg-black/35 backdrop-blur-md rounded-xl border border-white/15 shadow-lg overflow-hidden">
              <div className="px-3 py-1.5 border-b border-white/10 bg-black/20 flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/60 shrink-0">
                  Week {nextGameWeek ?? "—"}
                </span>
                {nextGame && (
                  <span className="text-xs font-bold text-white truncate">
                    {nextGame.homeAway === "home" ? "vs" : "@"} {opponentLabelFor(nextGame.opponentId)}
                  </span>
                )}
              </div>
              {nextGameLoading ? (
                <p className="text-xs text-white/50 text-center py-4">Loading...</p>
              ) : (
                <div className="px-3 divide-y divide-dashed divide-white/10">
                  {[
                    ["Over/Under", nextGame?.gameTotal != null ? nextGame.gameTotal.toFixed(1) : "—"],
                    ["Implied Total", nextGame?.teamImpliedTotal != null ? nextGame.teamImpliedTotal.toFixed(1) : "—"],
                    ["Huddle Rank", huddleRank ? `${player.pos}${huddleRank.rank}` : "—"],
                    ["Proj. Pts", nextGame?.projectedPoints != null ? nextGame.projectedPoints.toFixed(1) : "—"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between py-1.5">
                      <span className="text-xs text-white/60">{label}</span>
                      <span className="text-sm font-bold text-white">{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Risk Rating — each creator sets their own, only editable from their own tab; Consensus averages across creators */}
        <div className="px-7 pt-6">
          <div className="flex items-center justify-between mb-1.5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Risk Rating{isConsensusTab && " · Consensus"}
            </h3>
            <div className="flex items-center gap-2">
              {displayedRisk != null && (
                <span className="text-sm font-bold" style={{ color: riskColor(displayedRisk) }}>
                  {displayedRisk}/10
                </span>
              )}
              {canEditRisk && displayedRisk != null && (
                <button
                  onClick={() => onClearRisk(player.id, activeCreator)}
                  className="text-[10px] text-gray-400 hover:text-red-500 underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {canEditRisk ? (
            <>
              <input
                type="range"
                min="1"
                max="10"
                value={displayedRisk ?? 1}
                onChange={(e) => onUpdateRiskLocal(player.id, activeCreator, Number(e.target.value))}
                onMouseUp={(e) => onCommitRisk(player.id, activeCreator, Number(e.target.value))}
                onTouchEnd={(e) => onCommitRisk(player.id, activeCreator, Number(e.target.value))}
                onKeyUp={(e) => onCommitRisk(player.id, activeCreator, Number(e.target.value))}
                onBlur={(e) => onCommitRisk(player.id, activeCreator, Number(e.target.value))}
                className="w-full accent-current"
                style={{ color: riskColor(displayedRisk ?? 1) }}
              />
              <div className="flex items-center justify-between mt-1">
                {displayedRisk == null ? (
                  <p className="text-xs text-gray-400 italic">Drag to set a rating</p>
                ) : <span />}
                {riskSaveStatus?.playerId === player.id && (
                  <p className={`text-[10px] ${
                    riskSaveStatus.status === "error" ? "text-red-500" : "text-gray-400"
                  }`}>
                    {riskSaveStatus.status === "saving" ? "Saving…" : riskSaveStatus.status === "saved" ? "Saved" : "Failed to save — try again"}
                  </p>
                )}
              </div>
            </>
          ) : displayedRisk != null ? (
            <>
              <div
                className="relative h-2 rounded-full"
                style={{ background: `linear-gradient(to right, ${riskColor(1)}, ${riskColor(10)})` }}
              >
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-card border-2 shadow"
                  style={{
                    left: `calc(${((displayedRisk - 1) / 9) * 100}% - 7px)`,
                    borderColor: riskColor(displayedRisk),
                  }}
                />
              </div>
              {isConsensusTab && ACTIVE_CREATORS.some((c) => creatorRatings[c.id] != null) && (
                <p className="text-[11px] text-gray-400 mt-1.5">
                  {ACTIVE_CREATORS.filter((c) => creatorRatings[c.id] != null)
                    .map((c) => `${c.short} ${creatorRatings[c.id]}`)
                    .join(" · ")}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="h-2 rounded-full bg-gray-100" />
              <p className="text-xs text-gray-400 italic mt-1.5">
                {isConsensusTab ? "No creators have rated this player yet" : "Risk not set"}
              </p>
            </>
          )}
        </div>

        {/* Waiver Wire — this week's mentions across creators, if any */}
        {!waiverMentionsLoading && waiverMentions.length > 0 && (
          <div className="px-7 pt-6 border-t border-white/10">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5">
              Waiver Wire · Week {weeklyCurrentNflWeek}
            </h3>
            <div className="space-y-2">
              {waiverMentions.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold text-ink shrink-0">
                      {ACTIVE_CREATORS.find((c) => c.id === m.creator_id)?.short || m.creator_id}
                    </span>
                    <span className="text-xs text-gray-400 truncate">
                      {WAIVER_CATEGORY_LABELS[m.category] || m.category}{m.position ? ` · ${m.position}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {m.term && (
                      <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                        m.term === "short" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                      }`}>
                        {m.term}
                      </span>
                    )}
                    {m.faab_pct !== null && m.faab_pct !== undefined && (
                      <span className="text-xs font-semibold text-ink">{Number(m.faab_pct).toFixed(1)}%</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fantasy Log — weekly rows (stats + fantasy points + that week's
            positional finish, e.g. "RB3") sourced from player_week_stats,
            synced weekly (app/api/cron/sync-week-stats/route.js) for the
            current season, backfilled for 2023-2025 (scripts/backfill-week-
            stats.js); or season totals with the season-long positional
            finish, via the same toggle other sites use to switch a log
            between week-by-week and full-season views. Year tabs switch
            which season's data both views show. */}
        <div className="px-7 pt-6 border-t border-white/10">
          <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Fantasy Log</h3>
            <div className="inline-flex items-center bg-white/5 border border-white/10 rounded-full p-0.5">
              {[{ id: "weekly", label: "Weekly" }, { id: "season", label: "Season" }].map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => setLogMode(mode.id)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                    logMode === mode.id ? "bg-blue-600 text-white" : "text-gray-400 hover:text-ink"
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1 mb-3 border-b border-white/10">
            {SEASON_TABS.map((yr) => (
              <button
                key={yr}
                onClick={() => setLogSeason(yr)}
                className={`px-3 py-1.5 text-xs font-semibold border-b-2 -mb-px transition-colors ${
                  logSeason === yr ? "border-blue-500 text-ink" : "border-transparent text-gray-400 hover:text-ink"
                }`}
              >
                {yr}
              </button>
            ))}
          </div>

          {seasonStatsLoading ? (
            <p className="text-xs text-gray-400 text-center py-6">Loading...</p>
          ) : logMode === "weekly" ? (
            gameLog.length > 0 ? (
              <>
                {/* Fixed hex text/border colors throughout this card, not the
                    theme-aware text-ink/text-gray-* tokens the rest of the
                    modal uses — this card's background is explicitly white
                    regardless of site theme, and those tokens flip light in
                    dark mode (see the `.dark` remap in app/globals.css),
                    which would make them unreadable here. */}
                <div className="overflow-x-auto rounded-xl border border-black/10 bg-gradient-to-b from-white to-[#F8FAFC] shadow-sm">
                  <table className="w-full text-xs">
                    <thead className="bg-black/[0.03] text-[#6B7280]">
                      <tr>
                        <th className="text-left px-2 py-2 font-medium">WK</th>
                        <th className="text-left px-2 py-2 font-medium">OPP</th>
                        {(GAME_LOG_COLUMNS[player.pos] || []).map((c) => (
                          <th key={c.key} className="text-center px-2 py-2 font-medium whitespace-nowrap">{c.label}</th>
                        ))}
                        <th className="text-center px-2 py-2 font-medium">RK</th>
                        <th className="text-center px-2 py-2 font-medium">FPTS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleGameLog.map((g, i) => {
                        const finishTier = finishQualityTier(g.positionalFinish);
                        const isLatest = logSeason === CURRENT_SEASON && g.week === weeklyCurrentNflWeek - 1;
                        return (
                          <tr
                            key={g.week}
                            className={`border-t border-black/[0.06] ${
                              isLatest ? "bg-blue-500/10 border-l-2 border-l-blue-500" : i % 2 === 1 ? "bg-black/[0.02]" : ""
                            }`}
                          >
                            <td className="px-2 py-2 text-[#0F172A] font-medium">
                              {g.week}
                              {isLatest && (
                                <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wide text-[#2563EB] align-middle">Latest</span>
                              )}
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap">
                              {g.isBye ? (
                                <span className="italic text-[#9CA3AF]">BYE</span>
                              ) : g.opponent ? (
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold ${
                                    g.matchupTier ? MATCHUP_TIER_CLASSES[g.matchupTier] : "text-[#6B7280]"
                                  }`}
                                  title={g.matchupTier ? `${MATCHUP_TIER_LABELS[g.matchupTier]} matchup — #${g.matchupRank} vs ${player.pos} entering week ${g.week}` : undefined}
                                >
                                  {g.homeAway === "home" ? "vs" : "@"} {g.opponent}
                                </span>
                              ) : (
                                <span className="text-[#6B7280]">—</span>
                              )}
                            </td>
                            {g.hasStats ? (
                              <>
                                {(GAME_LOG_COLUMNS[player.pos] || []).map((c) => (
                                  <td key={c.key} className="text-center px-2 py-2">
                                    <StatChip tier={statQualityTier(c.key, g.stats?.[c.key])}>{g.stats?.[c.key] ?? 0}</StatChip>
                                  </td>
                                ))}
                                <td className="text-center px-2 py-2">
                                  <StatChip tier={finishTier} bold>
                                    {g.positionalFinish ? `${player.pos}${g.positionalFinish}` : "—"}
                                  </StatChip>
                                </td>
                                <td className={`text-center px-2 py-2 font-bold ${QUALITY_TEXT_CLASSES[finishTier] || "text-[#0F172A]"}`}>{g.fantasyPoints}</td>
                              </>
                            ) : (
                              <>
                                {(GAME_LOG_COLUMNS[player.pos] || []).map((c) => (
                                  <td key={c.key} className="text-center px-2 py-2 text-[#9CA3AF]">—</td>
                                ))}
                                <td className="text-center px-2 py-2 text-[#9CA3AF]">—</td>
                                <td className="text-center px-2 py-2 text-[#9CA3AF]">—</td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {orderedGameLog.length > 3 && (
                  <button
                    onClick={() => setShowAllGames((v) => !v)}
                    className="w-full mt-2 py-1.5 rounded-lg text-[11px] font-semibold text-blue-400 hover:text-blue-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                  >
                    {showAllGames ? "Show fewer weeks" : `Show all ${orderedGameLog.length} weeks`}
                  </button>
                )}
                <div className="flex items-center justify-between mt-2 flex-wrap gap-1.5">
                  <p className="text-[10px] text-gray-400">Full PPR scoring</p>
                  <div className="flex items-center gap-3">
                    {[["good", "Good"], ["mid", "Mid"], ["bad", "Bad"]].map(([tier, label]) => (
                      <span key={tier} className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                        <span className={`w-2 h-2 rounded-sm ${tier === "mid" ? "bg-[#D1D5DB]" : QUALITY_CHIP_CLASSES[tier].split(" ")[0]}`} />
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-400 text-center py-6">No games logged for {logSeason} yet.</p>
            )
          ) : seasonTotals ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">{seasonTotals.season} Season</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-ink">
                    {statsMode === "perGame" && seasonTotals.games_played > 0
                      ? Math.round((seasonTotals.fantasy_points / seasonTotals.games_played) * 10) / 10
                      : seasonTotals.fantasy_points} pts
                  </span>
                  {seasonTotals.fantasy_finish && (
                    <span className="text-[10px] font-bold uppercase bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                      {seasonTotals.position}{seasonTotals.fantasy_finish}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-end mb-2">
                <div className="inline-flex items-center bg-white/5 border border-white/10 rounded-full p-0.5">
                  {[{ id: "total", label: "Total" }, { id: "perGame", label: "Per Game" }].map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => setStatsMode(mode.id)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                        statsMode === mode.id ? "bg-blue-600 text-white" : "text-gray-400 hover:text-ink"
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                {seasonStatLine(seasonTotals.position, seasonTotals.stats, statsMode === "perGame", seasonTotals.games_played).map((s) => (
                  <div key={s.label} className="bg-white/5 border border-white/10 rounded-xl px-2.5 py-2 text-center">
                    <p className="text-sm font-bold text-ink">{s.value}</p>
                    <p className="text-[9px] text-gray-400 uppercase tracking-wide">{s.label}</p>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-2">Full PPR scoring · {seasonTotals.games_played} games played</p>
            </>
          ) : (
            <p className="text-xs text-gray-400 text-center py-6">No season data available for {logSeason}.</p>
          )}
        </div>

        {/* Rankings table */}
        <div className="p-7 border-t border-white/10">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3.5">Rankings by Format</h3>
          {playerRankingsLoading ? (
            <p className="text-gray-400 text-sm py-6 text-center">Loading...</p>
          ) : (
            <div className="relative pl-4">
              {/* Active-format indicator dot — sits in the gutter outside the
                  glowing row, aligned to the active row's fixed position (it's
                  always sorted to the first data row, right below the header). */}
              <span className="absolute left-0 top-[66px] -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(37,99,235,0.9)]" />
              <div className="rounded-xl overflow-hidden border border-white/10">
                <table className="w-full text-sm">
                  <thead className="bg-white/5 text-gray-500">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">Format</th>
                      <th className="text-center px-4 py-3 font-medium">Consensus</th>
                      <th className="text-center px-4 py-3 font-medium">RookieRager</th>
                      <th className="text-center px-4 py-3 font-medium">FFHuddle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[activeFormat, ...FORMATS.filter(fmt => fmt !== activeFormat)].map(fmt => {
                      const row = playerRankings[fmt] || {};
                      const isActive = fmt === activeFormat;
                      return (
                        <tr
                          key={fmt}
                          className={`border-t transition-colors ${
                            isActive
                              ? "relative z-10 border-blue-200 bg-blue-50 ring-2 ring-inset ring-blue-400 shadow-[0_0_18px_rgba(37,99,235,0.45)]"
                              : "border-white/10 hover:bg-white/5"
                          }`}
                        >
                          <td className="px-4 py-3.5 font-medium text-ink">{fmt}</td>
                          <td className="px-4 py-3.5 text-center text-gray-600">{row.consensus ?? "—"}</td>
                          <td className="px-4 py-3.5 text-center text-gray-600">{row.rookierager ?? "—"}</td>
                          <td className="px-4 py-3.5 text-center text-gray-600">{row.ffhuddle ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        </div>
      </div>
    </div>
  );
}
