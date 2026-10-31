import { setupCtas } from "./cta";
import { startExample } from "./example-post";
import { setupWaitlist } from "./waitlist";

export function start(): void {
  setupCtas();
  setupWaitlist();
  startExample();
}
