"use client";
import { useId } from "react";

// Side-profile helmet in each team's on-field helmet colors — used in place
// of the plain team-letters tile for DST rows. Colors only (shell, center
// stripe, facemask) with the team abbreviation as the side decal; no team
// logos, which are trademarked.
//   [shell, stripe, facemask]
const HELMETS = {
  ARI: ["#FFFFFF", "#97233F", "#101820"], ATL: ["#101820", "#A71930", "#101820"],
  BAL: ["#241773", "#101820", "#101820"], BUF: ["#FFFFFF", "#C60C30", "#00338D"],
  CAR: ["#BFC0BF", "#0085CA", "#101820"], CHI: ["#0B162A", "#C83803", "#0B162A"],
  CIN: ["#FB4F14", "#101820", "#101820"], CLE: ["#FF3C00", "#311D00", "#311D00"],
  DAL: ["#B0B7BC", "#041E42", "#041E42"], DEN: ["#002244", "#FB4F14", "#002244"],
  DET: ["#B0B7BC", "#0076B6", "#0076B6"], GB:  ["#FFB612", "#203731", "#203731"],
  HOU: ["#03202F", "#A71930", "#03202F"], IND: ["#FFFFFF", "#002C5F", "#A2AAAD"],
  JAX: ["#101820", "#006778", "#101820"], KC:  ["#E31837", "#FFFFFF", "#FFFFFF"],
  LAC: ["#FFFFFF", "#0080C6", "#FFC20E"], LAR: ["#003594", "#FFA300", "#003594"],
  LV:  ["#A5ACAF", "#101820", "#101820"], MIA: ["#FFFFFF", "#008E97", "#008E97"],
  MIN: ["#4F2683", "#FFC62F", "#4F2683"], NE:  ["#B0B7BC", "#002244", "#002244"],
  NO:  ["#D3BC8D", "#101820", "#101820"], NYG: ["#0B2265", "#A71930", "#A5ACAF"],
  NYJ: ["#FFFFFF", "#125740", "#125740"], PHI: ["#004C54", "#A5ACAF", "#101820"],
  PIT: ["#101820", "#FFB612", "#101820"], SEA: ["#002244", "#69BE28", "#002244"],
  SF:  ["#B3995D", "#AA0000", "#A5ACAF"], TB:  ["#3D3935", "#D50A0A", "#101820"],
  TEN: ["#0C2340", "#4B92DB", "#0C2340"], WAS: ["#5A1414", "#FFB612", "#5A1414"],
};

export function isTeamCode(code) {
  return Boolean(code && HELMETS[code]);
}

function luminance(hex) {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = (num >> 16) & 0xff, g = (num >> 8) & 0xff, b = num & 0xff;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// Decal reads in the stripe color when it stands out from the shell,
// otherwise plain dark/white for contrast.
function decalColor(shell, stripe) {
  if (Math.abs(luminance(shell) - luminance(stripe)) > 0.35) return stripe;
  return luminance(shell) > 0.6 ? "#0F172A" : "#FFFFFF";
}

const SHELL = "M8 36 C8 19 20 8 35 8 C48 8 57 17 57 29 L57 33 L46 33 C43 33 41 35 41 38 L41 44 C41 49 37 52 32 52 L20 52 C13 52 8 45 8 36 Z";

const FACEMASK_BARS = [
  "M47 33.5 Q57 33 61 37.5 Q63 43.5 60 49 Q52 53.5 41 50",
  "M42.5 42 Q53 40.5 62 43",
  "M53 34.5 Q55 43 52.5 51.5",
];

export default function TeamHelmet({ team, className = "", showDecal = true }) {
  const clipId = useId();
  const [shell, stripe, mask] = HELMETS[team] || ["#2563EB", "#FFFFFF", "#1E40AF"];
  const label = team || "?";
  const fontSize = label.length > 2 ? 11 : 13;

  return (
    <svg viewBox="0 0 64 64" className={`flex-shrink-0 ${className}`} role="img" aria-label={`${label} helmet`}>
      <defs>
        <clipPath id={clipId}>
          <path d={SHELL} />
        </clipPath>
      </defs>
      {/* Shell */}
      <path d={SHELL} fill={shell} />
      <g clipPath={`url(#${clipId})`}>
        {/* Center stripe over the crown */}
        <path d="M10 31 C11 18 22 11.5 35 11.5 C46 11.5 54 18 55.5 28" fill="none" stroke={stripe} strokeWidth="4.5" />
        {/* Gloss highlight */}
        <ellipse cx="24" cy="20" rx="10" ry="5" fill="#FFFFFF" opacity="0.22" transform="rotate(-25 24 20)" />
        {/* Ear hole */}
        <circle cx="30" cy="44" r="2.2" fill="#000000" opacity="0.3" />
      </g>
      {/* Outline so white/silver shells hold up on light backgrounds */}
      <path d={SHELL} fill="none" stroke="#000000" strokeOpacity="0.28" strokeWidth="1.2" />
      {showDecal && (
        <text
          x="25" y="35" textAnchor="middle"
          fontSize={fontSize} fontWeight="800" fontFamily="system-ui, sans-serif"
          fill={decalColor(shell, stripe)}
        >
          {label}
        </text>
      )}
      {/* Facemask — curved bars from brow and jaw out to the front */}
      {luminance(mask) > 0.75 && (
        // Darker under-stroke so white/light facemasks show on light rows
        <g fill="none" stroke="#000000" strokeOpacity="0.35" strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round">
          {FACEMASK_BARS.map((d) => <path key={d} d={d} />)}
        </g>
      )}
      <g fill="none" stroke={mask} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        {FACEMASK_BARS.map((d) => <path key={d} d={d} />)}
      </g>
    </svg>
  );
}
