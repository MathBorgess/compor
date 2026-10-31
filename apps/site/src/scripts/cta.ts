export function setupCtas(): void {
  const links = document.querySelectorAll<HTMLAnchorElement>('a[href*="#lista"]');

  for (const link of links) {
    link.addEventListener("click", (event) => {
      const target = document.getElementById("lista");
      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({ block: "start" });
      target.focus({ preventScroll: true });
    });
  }
}
