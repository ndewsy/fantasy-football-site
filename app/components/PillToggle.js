"use client";

// Sitewide "blue bubble" segmented toggle — bold rounded pill, blue when
// active, gray when inactive. Used for format/mode switchers across the site.
export default function PillToggle({ options, value, onChange, className = "" }) {
  return (
    <div className={`flex items-center justify-center gap-2.5 flex-wrap ${className}`}>
      {options.map((opt) => {
        const id = typeof opt === "string" ? opt : opt.id;
        const label = typeof opt === "string" ? opt : opt.label;
        const active = value === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`px-4 py-1.5 rounded-full text-sm font-extrabold uppercase tracking-wide shadow-md transition-all ${
              active
                ? "bg-[#2563EB] text-white shadow-blue-600/30"
                : "bg-gray-200 text-gray-500 shadow-gray-400/10 hover:bg-gray-300"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
