"use client";

// Two-state pill slider — e.g. Avg/Total PPG — shared between the /players
// leaderboard (light surface) and the player card (always-dark modal), so
// both switch the same way. `active` is whichever of `leftValue`/
// `rightValue` is currently selected.
export default function StatsModeSlider({ active, leftValue, rightValue, leftLabel, rightLabel, onChange, variant = "light" }) {
  const isRight = active === rightValue;
  const track = variant === "dark" ? "bg-white/10 border-white/15" : "bg-gray-100 border-gray-200";
  const inactiveText = variant === "dark" ? "text-gray-400" : "text-gray-500";
  return (
    <button
      type="button"
      onClick={() => onChange(isRight ? leftValue : rightValue)}
      className={`relative inline-flex items-center h-7 w-32 rounded-full border shrink-0 ${track}`}
      aria-label="Toggle stats mode"
    >
      <span
        className={`absolute top-0.5 left-0.5 h-6 w-[calc(50%-2px)] rounded-full bg-[#2563EB] shadow transition-transform duration-200 ${
          isRight ? "translate-x-full" : ""
        }`}
      />
      <span className={`relative z-10 w-1/2 text-center text-[11px] font-bold transition-colors ${!isRight ? "text-white" : inactiveText}`}>
        {leftLabel}
      </span>
      <span className={`relative z-10 w-1/2 text-center text-[11px] font-bold transition-colors ${isRight ? "text-white" : inactiveText}`}>
        {rightLabel}
      </span>
    </button>
  );
}
