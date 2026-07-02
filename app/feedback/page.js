"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase";
import NavBar from "@/app/components/NavBar";

const TABS = [
  { key: "help", label: "Get Help" },
  { key: "idea", label: "Share an Idea" },
];

const PLACEHOLDERS = {
  help: {
    subject: "e.g. Can't access my subscription",
    message: "Describe your issue in as much detail as possible...",
  },
  idea: {
    subject: "e.g. Add weekly waiver wire rankings",
    message: "Tell us about your idea. What problem does it solve? How would it work?",
  },
};

export default function FeedbackPage() {
  const [activeTab, setActiveTab] = useState("help");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  function switchTab(tab) {
    setActiveTab(tab);
    setSubmitted(false);
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !message.trim()) {
      setError("Email and message are required.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: dbError } = await supabase.from("feedback").insert({
        type: activeTab,
        name: name.trim() || null,
        email: email.trim(),
        subject: subject.trim() || null,
        message: message.trim(),
      });
      if (dbError) throw dbError;
      setSubmitted(true);
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
    } catch (err) {
      setError("Something went wrong. Please try again.");
      console.error(err);
    }
    setSubmitting(false);
  }

  const ph = PLACEHOLDERS[activeTab];

  return (
    <main className="min-h-screen text-[#0F172A]">
      <NavBar activePath="/feedback" />

      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Contact Us</h1>
        <p className="text-gray-500 mb-8">Got a question or a great idea? We'd love to hear from you.</p>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-gray-200 mb-8">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => switchTab(key)}
              className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="bg-white/70 backdrop-blur-md rounded-xl border border-white/80 shadow-lg p-6">
          {submitted ? (
            <div className="py-8 text-center">
              <div className="w-14 h-14 rounded-full bg-green-50 border border-green-200 flex items-center justify-center mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 className="text-xl font-bold mb-2">
                {activeTab === "help" ? "Request received!" : "Thanks for the idea!"}
              </h2>
              <p className="text-gray-500 text-sm mb-6">
                {activeTab === "help"
                  ? "We'll get back to you at the email you provided as soon as possible."
                  : "We read every suggestion and use them to shape the product."}
              </p>
              <button
                onClick={() => setSubmitted(false)}
                className="text-blue-600 text-sm font-medium hover:text-blue-700 transition-colors"
              >
                Submit another →
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Your name"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-[#0F172A] placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Email <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-[#0F172A] placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder={ph.subject}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-[#0F172A] placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Message <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder={ph.message}
                  rows={5}
                  required
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-[#0F172A] placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm resize-none"
                />
              </div>

              {error && (
                <p className="text-red-500 text-sm">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? "Sending..." : activeTab === "help" ? "Send Request" : "Share Idea"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
