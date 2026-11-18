import { brandImages } from "../lib/entry-content";

export default function BrandSymbol({ motion = "still" }: { motion?: "still" | "arriving" | "working" }) {
  return (
    <span className="compor-brand-symbol" data-motion={motion} aria-hidden="true">
      <img src={brandImages.symbol.src} alt="" width={brandImages.symbol.width} height={brandImages.symbol.height} />
    </span>
  );
}
