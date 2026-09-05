import { anton } from "@/lib/fonts";

// Sitewide page-header treatment: bold condensed Anton title, optional
// tracked-out subtitle underneath. Used for the main title on every
// top-level page (Rankings, Start/Sit, Auction Draft, Picks, etc).
export default function PageTitle({ title, subtitle, className = "" }) {
  return (
    <div className={`text-center mb-2 ${className}`}>
      <h1 className={`${anton.className} text-4xl sm:text-5xl uppercase tracking-tight leading-none text-ink`}>
        {title}
      </h1>
      {subtitle && (
        <p className="text-gray-400 font-semibold tracking-[0.3em] uppercase text-sm mt-0.5">{subtitle}</p>
      )}
    </div>
  );
}
