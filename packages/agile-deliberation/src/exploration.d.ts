export interface ExplorationPromptInput {
  offer: string;
  audience: string;
  briefAudience?: string;
  goal: string;
  direction: string;
  accepted: string[];
  rejected: string[];
  feedback?: {action:'selected'|'rejected'|'comment';comment:string;composition:string;contrast:string}[];
  sequence: number;
}
export function createExplorationPrompt(input: ExplorationPromptInput): {prompt:string;composition:string;contrast:string};
