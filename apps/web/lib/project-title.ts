import { SHORT_PROJECT_TITLE_LENGTH } from "@compor/agents-api/studio-chat-tools";

/** Names a new project with the start of the idea until the agent proposes a short title. */
export function provisionalTitle(idea: string): string {
  const text = idea.replace(/\s+/g, " ").trim();
  if (text.length <= SHORT_PROJECT_TITLE_LENGTH) return text;
  const end = text.lastIndexOf(" ", SHORT_PROJECT_TITLE_LENGTH);
  return text.slice(0, end > 0 ? end : SHORT_PROJECT_TITLE_LENGTH);
}
