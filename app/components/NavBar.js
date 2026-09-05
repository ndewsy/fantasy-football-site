"use client";
import { useEffect, useRef, useState } from "react";
import { Montserrat } from "next/font/google";
import { createClient } from "@/lib/supabase";

const montserrat = Montserrat({ subsets: ["latin"], display: "swap" });

function RankingsIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 16V9M10 16V4M16 16v-5" />
    </svg>
  );
}
function CreatorsIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="7" cy="6.5" r="2.5" />
      <path d="M2 16c0-2.6 2.1-4.3 5-4.3s5 1.7 5 4.3" />
      <circle cx="15" cy="7.5" r="2" />
      <path d="M12.7 11.9c2 .3 3.8 1.7 3.8 4.1" />
    </svg>
  );
}
function StartSitIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 3v14M15 3v14" />
      <path d="M5 6l3-3 3 3M15 14l-3 3-3-3" />
    </svg>
  );
}
function AuctionIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M10 2.5v3M6 5.5h8l-1.3 6H7.3z" />
      <path d="M8.5 11.5l-3 4.5h9l-3-4.5" />
      <path d="M4 17.5h12" />
    </svg>
  );
}
function PicksIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="14" height="14" rx="3" />
      <path d="M6.5 10l2.3 2.3L14 7.5" />
    </svg>
  );
}
function LeaderboardIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6.5 2.5h7V7a3.5 3.5 0 01-7 0V2.5z" />
      <path d="M6.5 3.5H4a1 1 0 00-.95 1.3l.5 1.6a2 2 0 001.9 1.4h.6" />
      <path d="M13.5 3.5H16a1 1 0 01.95 1.3l-.5 1.6a2 2 0 01-1.9 1.4h-.6" />
      <path d="M10 10.5v2.3M7.3 17h5.4M8.3 12.8h3.4v4.2H8.3z" />
    </svg>
  );
}
function FeedbackIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 4.5h14v9H8.2L4 16.8v-3.3H3v-9z" />
    </svg>
  );
}
function WaiverWireIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 4h14M6 4v11l4 2 4-2V4" />
    </svg>
  );
}
function DashboardIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.3" />
      <rect x="11" y="2.5" width="6.5" height="6.5" rx="1.3" />
      <rect x="2.5" y="11" width="6.5" height="6.5" rx="1.3" />
      <rect x="11" y="11" width="6.5" height="6.5" rx="1.3" />
    </svg>
  );
}
function AccountIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="10" cy="6.8" r="3.2" />
      <path d="M3.3 17c0-3.7 3-6.2 6.7-6.2s6.7 2.5 6.7 6.2" />
    </svg>
  );
}

// Shared between the desktop sidebar and the mobile drawer so both render the
// exact same look — icon, label, and the blue-gradient active pill.
function NavLink({ href, label, Icon, active, onClick }) {
  return (
    <a
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
        active
          ? "bg-gradient-to-br from-[#2563EB] to-[#1E40AF] text-white shadow-md shadow-blue-600/20"
          : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
      }`}
    >
      <Icon className="w-5 h-5 shrink-0" />
      {label}
    </a>
  );
}

export default function NavBar({ activePath = "/" }) {
  const [user, setUser] = useState(null);
  const [isDashboardUser, setIsDashboardUser] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        const { data: prof } = await supabase.from("profiles").select("role, is_creator").eq("id", user.id).maybeSingle();
        setIsDashboardUser(!!(prof && (prof.role === "admin" || prof.is_creator)));
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e) {
      if (navRef.current && !navRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  const links = [
    { href: "/", label: "Rankings", icon: RankingsIcon },
    { href: "/start-sit", label: "Start/Sit", icon: StartSitIcon },
    { href: "/auction", label: "Auction Draft", icon: AuctionIcon },
    { href: "/creators", label: "Creators", icon: CreatorsIcon },
    { href: "/picks", label: "Picks", icon: PicksIcon },
    ...(user ? [{ href: "/leaderboard", label: "Leaderboard", icon: LeaderboardIcon }] : []),
    { href: "/feedback", label: "Feedback", icon: FeedbackIcon },
    ...(isDashboardUser ? [{ href: "/waiver-wire", label: "Waiver Wire", icon: WaiverWireIcon }] : []),
    ...(isDashboardUser ? [{ href: "/dashboard", label: "Dashboard", icon: DashboardIcon }] : []),
  ];

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden lg:flex fixed left-0 top-0 h-screen w-56 flex-col bg-white border-r border-gray-100 z-50">
        <a href="/" className={`${montserrat.className} text-lg font-bold text-blue-600 leading-tight px-6 pt-7 pb-8 block`}>
          Fantasy<br />Collective
        </a>
        <div className="flex-1 flex flex-col gap-1 px-3 overflow-y-auto">
          {links.map(({ href, label, icon }) => (
            <NavLink key={href} href={href} label={label} Icon={icon} active={activePath === href} />
          ))}
        </div>
        <div className="px-3 pb-6 pt-2">
          {user ? (
            <NavLink href="/account" label="My Account" Icon={AccountIcon} active={activePath === "/account"} />
          ) : (
            <a href="/login" className="flex items-center justify-center gap-2 bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-semibold px-3 py-2.5 rounded-xl transition-all text-sm">
              Login
            </a>
          )}
        </div>
      </nav>

      {/* Mobile top bar — light/white to match the desktop sidebar, opens a drawer
          styled identically to it rather than a plain-text dropdown. */}
      <nav ref={navRef} className="lg:hidden relative sticky top-0 z-50 px-4 py-3 flex items-center justify-between bg-white border-b border-gray-100">
        <a href="/" className={`${montserrat.className} text-lg font-bold text-blue-600 shrink-0`}>Fantasy Collective</a>

        <button
          className="flex items-center justify-center w-10 h-10 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors"
          onClick={() => setMenuOpen(prev => !prev)}
          aria-label="Toggle menu"
        >
          {menuOpen ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="4" y1="4" x2="16" y2="16" />
              <line x1="16" y1="4" x2="4" y2="16" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="3" y1="5.5" x2="17" y2="5.5" />
              <line x1="3" y1="10" x2="17" y2="10" />
              <line x1="3" y1="14.5" x2="17" y2="14.5" />
            </svg>
          )}
        </button>

        {/* Backdrop */}
        <div
          className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-200 ${menuOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />

        {/* Drawer — same nav items, same styling, same logo as the desktop sidebar */}
        <div
          className={`fixed top-0 left-0 h-screen w-72 max-w-[80vw] bg-white z-50 shadow-2xl flex flex-col transition-transform duration-200 ${
            menuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-6 pt-7 pb-8">
            <span className={`${montserrat.className} text-lg font-bold text-blue-600 leading-tight`}>
              Fantasy<br />Collective
            </span>
            <button
              onClick={() => setMenuOpen(false)}
              className="text-gray-400 hover:text-gray-700 transition-colors"
              aria-label="Close menu"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="4" y1="4" x2="16" y2="16" />
                <line x1="16" y1="4" x2="4" y2="16" />
              </svg>
            </button>
          </div>
          <div className="flex-1 flex flex-col gap-1 px-3 overflow-y-auto">
            {links.map(({ href, label, icon }) => (
              <NavLink key={href} href={href} label={label} Icon={icon} active={activePath === href} onClick={() => setMenuOpen(false)} />
            ))}
          </div>
          <div className="px-3 pb-6 pt-2">
            {user ? (
              <NavLink href="/account" label="My Account" Icon={AccountIcon} active={activePath === "/account"} onClick={() => setMenuOpen(false)} />
            ) : (
              <a href="/login" className="flex items-center justify-center gap-2 bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-semibold px-3 py-2.5 rounded-xl transition-all text-sm">
                Login
              </a>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
