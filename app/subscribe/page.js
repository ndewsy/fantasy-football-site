"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase";
import NavBar from "@/app/components/NavBar";

const creators = [
  { id: "rookierager", name: "RookieRager", specialty: "Dynasty SF", color: "bg-green-600", avatar: "RR" },
  { id: "ffhuddle", name: "FantasyFootballHuddle", specialty: "Redraft 1QB", color: "bg-blue-600", avatar: "FFH" },
];

export default function SubscribePage() {
  const [includedCreator, setIncludedCreator] = useState("");
  const [addOns, setAddOns] = useState([]);

  const toggleAddOn = (id) => {
    setAddOns((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const total = 10 + addOns.length * 5;

  async function handleSubscribe() {
    if (!includedCreator) {
      alert("Please select a creator community to include with your plan.");
      return;
    }
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    localStorage.setItem('included_creator', includedCreator);
    localStorage.setItem('add_on_creators', JSON.stringify(addOns));
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ includedCreator, addOns }),
    });
    const { url } = await res.json();
    window.location.href = url;
  }

  const availableAddOns = creators.filter((c) => c.id !== includedCreator);

  return (
    <main className="min-h-screen text-[#0F172A]">
      <NavBar activePath="/subscribe" />

      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold mb-2">Get Access</h1>
        <p className="text-gray-500 mb-10">One subscription unlocks all rankings plus one creator community of your choice.</p>

        {/* Base Plan */}
        <div className="bg-white/70 backdrop-blur-md rounded-xl p-6 border-2 border-blue-600 shadow-lg mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold">Base Plan</h2>
              <p className="text-gray-500 text-sm mt-1">All rankings · Consensus tab · 1 creator community included</p>
            </div>
            <span className="text-2xl font-bold text-blue-600">$10<span className="text-sm text-gray-400">/mo</span></span>
          </div>
          <ul className="text-gray-500 text-sm space-y-1 mb-6">
            <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Dynasty SF rankings</li>
            <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Dynasty 1QB rankings</li>
            <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Redraft PPR rankings</li>
            <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Redraft 0.5PPR rankings</li>
            <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Consensus rankings from all creators</li>
            <li className="flex items-center gap-2"><span className="text-green-500">✓</span> One creator community included</li>
          </ul>

          <label className="block text-sm text-gray-500 mb-2">Choose your included community</label>
          <select
            value={includedCreator}
            onChange={(e) => {
              setIncludedCreator(e.target.value);
              setAddOns((prev) => prev.filter((id) => id !== e.target.value));
            }}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-[#0F172A] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="">-- Select a creator --</option>
            {creators.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Add-on Communities */}
        {includedCreator && (
          <div className="bg-white/70 backdrop-blur-md rounded-xl p-6 border border-white/80 shadow-lg mb-6">
            <h2 className="text-lg font-bold mb-1">Add More Communities <span className="text-amber-500">+$5/mo each</span></h2>
            <p className="text-gray-500 text-sm mb-4">Get access to additional creator communities.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {availableAddOns.map((c) => (
                <button
                  key={c.id}
                  onClick={() => toggleAddOn(c.id)}
                  className={"flex items-center gap-3 p-3 rounded-lg border text-left transition-all " + (addOns.includes(c.id) ? "border-blue-500 bg-blue-50/80 backdrop-blur-sm" : "border-white/70 hover:border-white/90 bg-white/60 backdrop-blur-sm hover:bg-white/80")}
                >
                  <div className={"w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white " + c.color}>{c.avatar}</div>
                  <div>
                    <p className="font-medium text-sm">{c.name}</p>
                  </div>
                  {addOns.includes(c.id) && <span className="ml-auto text-blue-600 text-xs font-semibold">+$5</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Total & CTA */}
        <div className="bg-white/70 backdrop-blur-md rounded-xl p-6 border border-white/80 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-500">Base plan</span>
            <span className="text-[#0F172A] font-medium">$10/mo</span>
          </div>
          {addOns.map((id) => {
            const c = creators.find((x) => x.id === id);
            return (
              <div key={id} className="flex items-center justify-between mb-2">
                <span className="text-gray-500">{c.name} community</span>
                <span className="text-[#0F172A] font-medium">+$5/mo</span>
              </div>
            );
          })}
          <div className="border-t border-gray-100 mt-4 pt-4 flex items-center justify-between mb-4">
            <span className="text-gray-500">Total per month</span>
            <span className="text-3xl font-bold text-blue-600">${total}/mo</span>
          </div>
          <button
            onClick={handleSubscribe}
            className="w-full bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-bold py-4 rounded-xl text-lg transition-all"
          >
            Subscribe Now
          </button>
          <p className="text-center text-gray-400 text-xs mt-3">Cancel anytime. Billed monthly.</p>
        </div>
      </div>
    </main>
  );
}
