"use client";
import { useEffect, useState } from "react";
import PlayerHeadshot from "@/app/components/PlayerHeadshot";
import { anton } from "@/lib/fonts";
import { riskColor } from "@/lib/riskColor";
import { teamColors } from "@/lib/teamColors";
import { expandIds, normalizeName, computeConsensus } from "@/lib/rankingsHelpers";

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
  const [seasonStats, setSeasonStats] = useState(null);
  const [seasonStatsLoading, setSeasonStatsLoading] = useState(true);
  const [statsMode, setStatsMode] = useState("total"); // "total" | "perGame"
  const [waiverMentions, setWaiverMentions] = useState([]);
  const [waiverMentionsLoading, setWaiverMentionsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    setPlayerRankingsLoading(true);
    setPlayerRankings({});
    setSeasonStatsLoading(true);
    setSeasonStats(null);
    setStatsMode("total");
    setWaiverMentionsLoading(true);
    setWaiverMentions([]);

    fetch(`/api/player-stats?playerId=${player.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setSeasonStats(d?.seasonStats || null); })
      .catch(() => { if (!cancelled) setSeasonStats(null); })
      .finally(() => { if (!cancelled) setSeasonStatsLoading(false); });

    fetch(`/api/waiver-wire?player_id=${player.id}&week=${weeklyCurrentNflWeek}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setWaiverMentions(d?.entries || []); })
      .catch(() => { if (!cancelled) setWaiverMentions([]); })
      .finally(() => { if (!cancelled) setWaiverMentionsLoading(false); });

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

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-modal-backdrop"
      style={{ willChange: "opacity" }}
      onClick={onClose}
    >
      <div
        className="bg-card/95 rounded-3xl border border-card/80 ring-1 ring-white/10 w-full max-w-xl lg:max-w-2xl relative animate-modal-card"
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
          className="relative p-5 sm:p-8 rounded-t-3xl overflow-hidden flex items-end gap-4 sm:gap-5"
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

        {/* Previous Season Stats */}
        {!seasonStatsLoading && seasonStats && (
          <div className="px-7 pt-6 border-t border-white/10">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{seasonStats.season} Season</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-ink">
                  {statsMode === "perGame" && seasonStats.games_played > 0
                    ? Math.round((seasonStats.fantasy_points / seasonStats.games_played) * 10) / 10
                    : seasonStats.fantasy_points} pts
                </span>
                {seasonStats.fantasy_finish && (
                  <span className="text-[10px] font-bold uppercase bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                    {seasonStats.position}{seasonStats.fantasy_finish}
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
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              {seasonStatLine(seasonStats.position, seasonStats.stats, statsMode === "perGame", seasonStats.games_played).map((s) => (
                <div key={s.label} className="bg-white/5 border border-white/10 rounded-xl px-2.5 py-2 text-center">
                  <p className="text-sm font-bold text-ink">{s.value}</p>
                  <p className="text-[9px] text-gray-400 uppercase tracking-wide">{s.label}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-2">Full PPR scoring · {seasonStats.games_played} games played</p>
          </div>
        )}

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
