import "./brand-symbol.css";

export default function BrandSymbol({ motion = "still" }) {
  return (
    <span className="compor-brand-symbol" data-motion={motion} aria-hidden="true">
      <img src="/studio/brand-symbol.svg" alt="" width="30" height="30.4667" />
    </span>
  );
}
