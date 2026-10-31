/** Experimental stdio host. Receives the key through a one-shot inherited FD. */
import { readFileSync, closeSync } from 'node:fs';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import OpenAI from 'openai';
import { createComporServer } from '../../dist/server.js';
import { PhoenixDecisionApiService } from '../../dist/phoenix_engine/services/decision_api.js';
import { createPhoenixHyperparams } from '../../dist/phoenix_engine/config/hyperparams.js';
const fd = Number(process.argv[2]);
if (!Number.isInteger(fd) || fd < 3) throw new Error('Invalid credential pipe');
const key = readFileSync(fd, 'utf8').trim();
closeSync(fd);
if (!key) throw new Error('Credential pipe is empty');
// Do not copy the key into process.env: image processing or an agent subprocess
// may otherwise inherit it. The injected client owns it only in process memory.
const hp = createPhoenixHyperparams();
const api = new OpenAI({ apiKey: key, maxRetries: 0, timeout: 45000 });
const service = new PhoenixDecisionApiService({ hp, openaiClient: api });
const server = createComporServer({ phoenixActorId: 'simulated_codex_decision', phoenixDecisionService: service });
await server.connect(new StdioServerTransport());
