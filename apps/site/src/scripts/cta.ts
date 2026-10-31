import { track, type CtaPosition } from "./analytics";

const POSITIONS = new Set<CtaPosition>(["header", "hero", "final"]);

export function setupCtas(): void {
  const links = document.querySelectorAll<HTMLAnchorElement>("[data-cta-position]");

  for (const link of links) {
    link.addEventListener("click", (event) => {
      const position = link.dataset.ctaPosition;
      if (!position || !POSITIONS.has(position as CtaPosition)) return;

      track({ name: "cta_clicked", position: position as CtaPosition });

      const href = link.getAttribute("href") ?? "";
      if (!href.includes("#lista")) return;

      const target = document.getElementById("lista");
      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({ block: "start" });
      target.focus({ preventScroll: true });
    });
  }
}
