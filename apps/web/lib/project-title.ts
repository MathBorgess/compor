import { SHORT_PROJECT_TITLE_LENGTH } from "@compor/agents-api/studio-chat-tools";
import type { StudioMessage } from "./studio-domain";

/** Names a new project with the start of the idea until the agent proposes a short title. */
export function provisionalTitle(idea: string): string {
  const text = idea.replace(/\s+/g, " ").trim();
  if (text.length <= SHORT_PROJECT_TITLE_LENGTH) return text;
  const end = text.lastIndexOf(" ", SHORT_PROJECT_TITLE_LENGTH);
  return text.slice(0, end > 0 ? end : SHORT_PROJECT_TITLE_LENGTH);
}

/** A title stays provisional while it equals the cut of the first message the person sent. */
export function isProvisionalTitle(title: string, messages: readonly Pick<StudioMessage, "role" | "text">[]): boolean {
  const first = messages.find(message => message.role === "user");
  return first !== undefined && title === provisionalTitle(first.text);
}
