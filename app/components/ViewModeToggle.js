"use client";
import { useEffect, useState } from "react";
import PillToggle from "@/app/components/PillToggle";
import { getViewMode, setViewMode } from "@/lib/viewMode";

const OPTIONS = [
  { id: "real", label: "My View" },
  { id: "subscriber", label: "Subscriber" },
  { id: "free", label: "Free" },
];

// Staff-only preview toggle — rendered in NavBar when the real (unsimulated)
// isDashboardUser is true. Reload-based rather than shared state: every page
// on the site already navigates via full <a href> loads (see NavBar.js), so
// each page just re-reads the cookie on its own mount.
export default function ViewModeToggle() {
  const [mode, setMode] = useState("real");

  useEffect(() => {
    setMode(getViewMode());
  }, []);

  function handleChange(next) {
    setViewMode(next);
    window.location.reload();
  }

  return (
    <div className="px-1 mb-3">
      <PillToggle options={OPTIONS} value={mode} onChange={handleChange} />
      {mode !== "real" && (
        <p className="text-[11px] text-amber-600 font-medium mt-1.5 px-1">
          Previewing as {mode === "subscriber" ? "a subscriber" : "a free user"}
        </p>
      )}
    </div>
  );
}
