import { setupCtas } from "./cta";
import { startExample } from "./example-post";
import { track } from "./analytics";
import { setupWaitlist } from "./waitlist";

export function start(): void {
  if (document.body.dataset.page === "landing") {
    track({ name: "landing_viewed" });
  }
  setupCtas();
  setupWaitlist();
  startExample();
}
