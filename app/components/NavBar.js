"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
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

  const activeClass = "text-white font-medium";
  const inactiveClass = "text-white hover:text-blue-100";

  return (
    <nav ref={navRef} className="relative sticky top-0 z-50 px-6 py-4 flex items-center justify-between" style={{backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 2px, transparent 2px, transparent 10px), linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #1e40af 100%)', boxShadow: '0 2px 20px rgba(37, 99, 235, 0.4)'}}>
      <a href="/" className="shrink-0">
        <Image src="/logo.png" alt="Fantasy Collective" width={1254} height={1254} className="h-10 w-auto" priority />
      </a>

      {/* Desktop nav */}
      <div className="hidden md:flex gap-4 items-center">
        {links.map(({ href, label }) => (
          <a key={href} href={href} className={activePath === href ? activeClass : inactiveClass}>
            {label}
          </a>
        ))}
        {user
          ? <a href="/account" className={`${activePath === "/account" ? "text-white font-medium" : "text-white"} hover:text-blue-100 transition-colors`}>My Account</a>
          : <a href="/login" className="bg-white text-blue-600 hover:bg-blue-50 font-semibold px-4 py-2 rounded-lg transition-colors">Login</a>
        }
      </div>

      {/* Mobile hamburger button */}
      <button
        className="md:hidden flex items-center justify-center w-11 h-11 rounded-lg text-white hover:bg-blue-500 transition-colors"
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
        <div className="md:hidden absolute top-full left-0 right-0 bg-blue-700 border-b border-blue-500 shadow-lg px-6 py-3 flex flex-col">
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
  );
}
