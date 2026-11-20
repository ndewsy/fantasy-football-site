"use client";
import { useState } from "react";
import TeamHelmet, { isTeamCode } from "./TeamHelmet";

const SIZES = {
  xs: "w-6 h-6 text-[9px]",
  sm: "w-8 h-8 text-[10px]",
  md: "w-10 h-10 text-xs",
  lg: "w-16 h-16 text-lg",
  xl: "w-28 h-28 text-3xl",
  "2xl": "w-20 h-20 sm:w-36 sm:h-36 text-xl sm:text-4xl",
  // Compact on mobile, matches "sm" on desktop — for dense table rows.
  tableRow: "w-6 h-6 lg:w-8 lg:h-8 text-[9px] lg:text-[10px]",
  // Large list rows (public Weekly Rankings) — roomy on desktop, a notch
  // smaller on mobile so the name and matchup still fit beside it.
  listRow: "w-12 h-12 sm:w-14 sm:h-14 text-sm",
};

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function contrastText(hex) {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#0F172A" : "#FFFFFF";
}

// ESPN's headshot CDN has near-total coverage for veteran players but is largely
// empty for anyone with under ~6 years of NFL experience. Sleeper's own CDN (keyed
// by sleeper_id, which every synced player has) fills that gap, so it's tried second.
// Either can still 404 for an individual player, hence the initials fallback.
export default function PlayerHeadshot({ espnId, sleeperId, name, size = "sm", shape = "circle", teamColor = null, label = null, position = null, team = null }) {
  const cls = SIZES[size] ?? SIZES.sm;
  // DST rows get a team helmet instead of a headshot or letters. Callers
  // flag them either by passing the team code as `label` or via position/team.
  const helmetTeam = isTeamCode(label) ? label : position === "DST" && isTeamCode(team) ? team : null;
  const shapeCls = shape === "square" ? (size === "xl" ? "rounded-xl" : "rounded-md") : "rounded";
  const sources = [];
  if (espnId) sources.push(`https://a.espncdn.com/i/headshots/nfl/players/full/${espnId}.png`);
  if (sleeperId) sources.push(`https://sleepercdn.com/content/nfl/players/thumb/${sleeperId}.jpg`);

  const [srcIndex, setSrcIndex] = useState(0);

  if (helmetTeam) {
    return <TeamHelmet team={helmetTeam} className={cls} showDecal={size !== "xs"} />;
  }

  if (sources.length === 0 || srcIndex >= sources.length) {
    return (
      <div
        className={`${cls} ${shapeCls} flex items-center justify-center font-bold flex-shrink-0 ${teamColor ? "" : "bg-gray-200 text-gray-500"}`}
        style={teamColor ? { backgroundColor: teamColor, color: contrastText(teamColor) } : undefined}
      >
        {label || initials(name)}
      </div>
    );
  }

  return (
    <img
      src={sources[srcIndex]}
      alt={name || ""}
      className={`${cls} ${shapeCls} object-cover flex-shrink-0 ${teamColor ? "" : "bg-gray-100"}`}
      style={teamColor ? { backgroundColor: teamColor } : undefined}
      onError={() => setSrcIndex((i) => i + 1)}
    />
  );
}
