export interface ExplorationPromptInput {
  idea?: string;
  offer: string;
  audience: string;
  briefAudience?: string;
  facts?: {label:string;value:string;status:'confirmed'|'pending'|'omitted'}[];
  goal: string;
  direction: string;
  accepted: string[];
  rejected: string[];
  feedback?: {action:'selected'|'rejected'|'comment';comment:string;composition:string;contrast:string}[];
  sequence: number;
}
export function createExplorationPrompt(input: ExplorationPromptInput): {prompt:string;composition:string;contrast:string};
