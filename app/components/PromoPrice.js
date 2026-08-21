// Inline "$50 → $10" price callout used in CTA buttons during the August promo.
// Renders inline text — safe to drop inside any button/link label.
export default function PromoPrice() {
  return (
    <>
      <span className="line-through opacity-60">$50</span>{" "}
      <span className="font-extrabold">$10</span>{" "}
      <span className="font-normal opacity-90">(5 months)</span>
    </>
  );
}
