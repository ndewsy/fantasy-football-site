export default function CreatorAvatar({ logoUrl, initials, colorClass, size = "lg" }) {
  const sizeMap = {
    sm:  "w-10 h-10 text-sm",
    md:  "w-14 h-14 text-lg",
    lg:  "w-20 h-20 text-2xl",
  };
  const cls = sizeMap[size] ?? sizeMap.lg;

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={initials}
        className={`${cls} rounded-full object-cover flex-shrink-0`}
      />
    );
  }

  return (
    <div className={`${colorClass} ${cls} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {initials}
    </div>
  );
}
