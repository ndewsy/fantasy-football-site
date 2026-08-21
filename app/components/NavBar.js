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
    { href: "/creators", label: "Creators", icon: CreatorsIcon },
    { href: "/picks", label: "Picks", icon: PicksIcon },
    ...(user ? [{ href: "/leaderboard", label: "Leaderboard", icon: LeaderboardIcon }] : []),
    { href: "/feedback", label: "Feedback", icon: FeedbackIcon },
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
          {links.map(({ href, label, icon: Icon }) => {
            const active = activePath === href;
            return (
              <a
                key={href}
                href={href}
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
          })}
        </div>
        <div className="px-3 pb-6 pt-2">
          {user ? (
            <a
              href="/account"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activePath === "/account"
                  ? "bg-gradient-to-br from-[#2563EB] to-[#1E40AF] text-white shadow-md shadow-blue-600/20"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <AccountIcon className="w-5 h-5 shrink-0" />
              My Account
            </a>
          ) : (
            <a href="/login" className="flex items-center justify-center gap-2 bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-semibold px-3 py-2.5 rounded-xl transition-all text-sm">
              Login
            </a>
          )}
        </div>
      </nav>

      {/* Mobile top bar */}
      <nav ref={navRef} className="lg:hidden relative sticky top-0 z-50 px-6 py-4 flex items-center justify-between" style={{backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 2px, transparent 2px, transparent 10px), linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #1e40af 100%)', boxShadow: '0 2px 20px rgba(37, 99, 235, 0.4)'}}>
        <a href="/" className={`${montserrat.className} text-xl font-bold text-white shrink-0`}>Fantasy Collective</a>

        <button
          className="flex items-center justify-center w-11 h-11 rounded-lg text-white hover:bg-blue-500 transition-colors"
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

        {menuOpen && (
          <div className="absolute top-full left-0 right-0 bg-blue-700 border-b border-blue-500 shadow-lg px-6 py-3 flex flex-col">
            {links.map(({ href, label }) => (
              <a
                key={href}
                href={href}
                className={`py-3 text-base font-medium border-b border-blue-600 last:border-0 transition-colors ${activePath === href ? "text-white" : "text-blue-100 hover:text-white"}`}
              >
                {label}
              </a>
            ))}
            {user
              ? <a href="/account" className={`py-3 text-base font-medium transition-colors ${activePath === "/account" ? "text-white" : "text-blue-100 hover:text-white"}`}>My Account</a>
              : <a href="/login" className="mt-3 mb-1 bg-white text-blue-600 font-bold px-4 py-3 rounded-xl text-center hover:bg-blue-50">Login</a>
            }
          </div>
        )}
      </nav>
    </>
  );
}
