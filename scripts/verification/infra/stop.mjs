import { resolve } from 'node:path';
import { stopInfra } from './stack.mjs';

if (!process.argv[2]) throw Error('usage: node stop.mjs RUN_DIRECTORY');
process.stdout.write(JSON.stringify(await stopInfra({ runDir: resolve(process.argv[2]) })) + '\n');
