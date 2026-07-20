"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import NavBar from "@/app/components/NavBar";

const creators = [
  { id: "rookierager", name: "RookieRager", handle: "@rookierager", specialty: "Dynasty SF", bio: "10 years of dynasty experience. Known for elite TE and QB analysis in superflex formats.", avatar: "RR", color: "bg-green-600", subscribers: 1240 },
  { id: "ffhuddle", name: "FantasyFootballHuddle", handle: "@ffhuddle", specialty: "Redraft PPR", bio: "Season-long specialist. ADP beater and waiver wire wizard. 3x contest winner.", avatar: "FFH", color: "bg-blue-600", subscribers: 980 },
  { id: "rbguru", name: "Coming Soon", handle: "@tba", specialty: "", bio: "A new creator is joining the platform soon.", avatar: "?", color: "bg-gray-400", subscribers: 0, comingSoon: true },
  { id: "wrtargets", name: "Coming Soon", handle: "@tba", specialty: "", bio: "A new creator is joining the platform soon.", avatar: "?", color: "bg-gray-400", subscribers: 0, comingSoon: true },
];

export default function CreatorsPage() {
  const [creatorProfiles, setCreatorProfiles] = useState({});

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: profiles } = await supabase.from("profiles").select("creator_id, display_name, handle, bio").eq("is_creator", true);
      const map = {};
      for (const p of (profiles || [])) {
        if (p.creator_id) map[p.creator_id] = p;
      }
      setCreatorProfiles(map);
    }
    load();
  }, []);

  return (
    <main className="min-h-screen text-[#0F172A]">
      <NavBar activePath="/creators" />
      <div className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-4xl font-bold mb-4">Our Creators</h2>
        <p className="text-gray-500 mb-12">Subscribe to get access to all rankings plus join a creator community.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {creators.map((creator) => {
            const db = creatorProfiles[creator.id];
            const name = db?.display_name || creator.name;
            const handle = db?.handle || creator.handle;
            const bio = creator.comingSoon
              ? creator.bio
              : (db?.bio || "New creator joining the platform.");
            return (
            <div key={creator.id} className={`bg-white/70 backdrop-blur-md rounded-xl p-6 border border-white/80 shadow-lg transition-shadow ${creator.comingSoon ? "opacity-70" : "hover:shadow-xl"}`}>
              <div className="flex items-center gap-4 mb-4">
                <div className={creator.color + " w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg"}>
                  {creator.avatar}
                </div>
                <div>
                  <h3 className="font-bold text-lg">{name}</h3>
                  <p className="text-gray-500 text-sm">{handle}</p>
                </div>
              </div>
              <p className="text-gray-500 text-sm mb-6">{bio}</p>
              <div className="flex items-center justify-end">
                {creator.comingSoon ? (
                  <span className="bg-gray-100 text-gray-400 font-semibold px-4 py-2 rounded-lg text-sm cursor-not-allowed">Coming Soon</span>
                ) : (
                  <a href={"/creators/" + creator.id} className="bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-all">View Community</a>
                )}
              </div>
            </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
