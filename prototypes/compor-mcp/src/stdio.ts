import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createComporServer } from './server.js';
import { parseGuidanceVariant } from './guidance.js';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { ProfileLedger } from './phoenix_engine/services/profile_ledger.js';
import { LocalCreativeStore } from './creative/local_creative.js';

// The evaluation runner selects this process-level arm; tools cannot change it.
const guidance = parseGuidanceVariant(process.env.COMPOR_MCP_GUIDANCE);
// Host-owned local identity and private state; neither is chosen by an MCP caller.
// This is a single-user prototype, not authentication for a network service.
const actor = 'codex_local_owner';
const profileDirectory = resolve(process.env.COMPOR_PROFILE_DIR ?? join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'compor-mcp', 'profile'));
const ledger = await ProfileLedger.restoreLocal(actor, profileDirectory);
// The image generator returns paths under the calling thread's directory.
// The host selects that one directory; MCP callers cannot broaden its scope.
const threadId = process.env.CODEX_THREAD_ID;
const imageRoot = threadId && /^[A-Za-z0-9_-]{1,100}$/.test(threadId)
  ? join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'generated_images', threadId)
  : null;
const creativeStore = new LocalCreativeStore(profileDirectory, actor, { allowedImageRoots: imageRoot ? [imageRoot] : [] });
const server = createComporServer({ guidance, phoenixActorId: actor, phoenixProfileSession: {
  ledger, persistenceDirectory: profileDirectory, directory: Promise.resolve(profileDirectory),
}, creativeStore });
await server.connect(new StdioServerTransport());
