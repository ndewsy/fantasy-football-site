"use client";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { applyTheme, getAppliedTheme } from "@/lib/theme";

// Invisible, mounted once in the root layout. The inline script in
// app/layout.js already applies whatever theme cookie exists before first
// paint (so there's no flash on repeat visits from this browser); this just
// reconciles that against the account's saved preference, so a toggle made
// on one device eventually applies on a fresh browser on another device.
export default function ThemeInitializer() {
  useEffect(() => {
    let cancelled = false;
    async function sync() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: profile } = await supabase.from("profiles").select("theme").eq("id", user.id).maybeSingle();
      const accountTheme = profile?.theme || "dark";
      if (!cancelled && accountTheme !== getAppliedTheme()) applyTheme(accountTheme);
    }
    sync();
    return () => { cancelled = true; };
  }, []);

  return null;
}
