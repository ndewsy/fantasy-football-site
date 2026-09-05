import { Geist, Geist_Mono } from "next/font/google";
import ThemeInitializer from "@/app/components/ThemeInitializer";
import "./globals.css";

// Runs before paint (inline, in <head>) so a repeat visitor's saved theme
// applies immediately instead of flashing the wrong one. Reads a plain
// cookie rather than localStorage so it works identically here. Dark is
// the site default — only an explicit "light" cookie opts back out.
const THEME_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )theme=([^;]+)/);if(!m||m[1]!=='light')document.documentElement.classList.add('dark');}catch(e){}})();`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Fantasy Collective",
  description: "Expert fantasy football rankings from top creators",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Fredoka+One&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeInitializer />
        {/* Background orbs */}
        <div style={{ position: "fixed", inset: 0, zIndex: -1, overflow: "hidden", pointerEvents: "none" }}>
          <div style={{ position: "absolute", top: "-8%", right: "-4%", width: "680px", height: "680px", borderRadius: "50%", background: "rgba(59,130,246,0.15)", filter: "blur(90px)" }} />
          <div style={{ position: "absolute", bottom: "5%", left: "-8%", width: "560px", height: "560px", borderRadius: "50%", background: "rgba(99,102,241,0.12)", filter: "blur(80px)" }} />
          <div style={{ position: "absolute", top: "45%", left: "55%", width: "420px", height: "420px", borderRadius: "50%", background: "rgba(147,197,253,0.1)", filter: "blur(70px)" }} />
        </div>
        {children}
      </body>
    </html>
  );
}
