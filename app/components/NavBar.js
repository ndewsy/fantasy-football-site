"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase";

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
    { href: "/", label: "Rankings" },
    { href: "/creators", label: "Creators" },
    { href: "/feedback", label: "Feedback" },
    ...(isDashboardUser ? [{ href: "/dashboard", label: "Creator Dashboard" }] : []),
  ];

  const activeClass = "text-blue-600 font-medium";
  const inactiveClass = "text-gray-600 hover:text-gray-900";

  return (
    <nav ref={navRef} className="relative bg-white/70 backdrop-blur-xl border-b border-white/80 shadow-sm sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
      <a href="/" className="text-xl font-bold text-blue-600 shrink-0">🏈 DynastyEdge</a>

      {/* Desktop nav */}
      <div className="hidden md:flex gap-4 items-center">
        {links.map(({ href, label }) => (
          <a key={href} href={href} className={activePath === href ? activeClass : inactiveClass}>
            {label}
          </a>
        ))}
        {user
          ? <a href="/account" className={`${activePath === "/account" ? activeClass : "text-blue-600"} font-medium hover:text-blue-700 transition-colors`}>My Account</a>
          : <a href="/login" className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors">Login</a>
        }
      </div>

      {/* Mobile hamburger button */}
      <button
        className="md:hidden flex items-center justify-center w-11 h-11 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
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

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-white/95 backdrop-blur-xl border-b border-gray-200 shadow-lg px-6 py-3 flex flex-col">
          {links.map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className={`py-3 text-base font-medium border-b border-gray-100 last:border-0 transition-colors ${activePath === href ? "text-blue-600" : "text-gray-700 hover:text-gray-900"}`}
            >
              {label}
            </a>
          ))}
          {user
            ? <a href="/account" className={`py-3 text-base font-medium transition-colors ${activePath === "/account" ? "text-blue-600" : "text-gray-700 hover:text-gray-900"}`}>My Account</a>
            : <a href="/login" className="mt-3 mb-1 bg-gradient-to-br from-[#2563EB] to-[#1E40AF] text-white font-bold px-4 py-3 rounded-xl text-center">Login</a>
          }
        </div>
      )}
    </nav>
  );
}
