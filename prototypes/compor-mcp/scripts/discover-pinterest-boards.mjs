#!/usr/bin/env node
import {
  CURATED_PINTEREST_BOARDS,
  discoverUserPublicBoards,
  parsePinterestBoardRss,
} from '../dist/providers/curated_pinterest.js';

const DEFAULT_ACCOUNTS = [
  'behance',
  'canva',
  'creativemarket',
  'latermedia',
  'hubspot',
  'venngage',
  'vismeapp',
  'piktochart',
  'kittldesign',
  '99designs',
  'thedieline',
  'weandthecolor',
  'dribbble',
  'adobe',
];

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function verifyCatalogRssSlugs() {
  console.log('=== 1. Validação HTTP de todos os slugs em CURATED_PINTEREST_BOARDS ===');
  for (const board of CURATED_PINTEREST_BOARDS) {
    const rssUrl = `https://www.pinterest.com/${board.slug}.rss`;
    try {
      const res = await fetch(rssUrl, { headers: { 'User-Agent': UA } });
      const xml = res.ok ? await res.text() : '';
      const pins = res.ok ? parsePinterestBoardRss(xml) : [];
      console.log(
        `${String(res.status).padEnd(3)} | pins: ${String(pins.length).padStart(2)} | [${board.category.padEnd(18)}] ${board.slug}.rss`,
      );
    } catch (err) {
      console.log(`ERR | pins:  0 | [${board.category.padEnd(18)}] ${board.slug}.rss (${err.message})`);
    }
  }
}

async function runAutodiscovery(accounts) {
  console.log('\n=== 2. Autodiscovery de pastas públicas (/resource/BoardsResource + __PWS_INITIAL_PROPS__) ===');
  for (const account of accounts) {
    const boards = await discoverUserPublicBoards(account);
    console.log(`\nConta @${account} -> ${boards.length} pastas públicas descobertas (firehose: ${account}/feed.rss):`);
    for (const b of boards.slice(0, 15)) {
      console.log(`  - ${b.slug.padEnd(48)} (${String(b.pin_count).padStart(5)} pins) — ${b.name}`);
    }
  }
}

const args = process.argv.slice(2);
const verifyOnly = args.includes('--verify-only');
const accounts = args.filter((a) => !a.startsWith('--'));

await verifyCatalogRssSlugs();
if (!verifyOnly) {
  await runAutodiscovery(accounts.length > 0 ? accounts : DEFAULT_ACCOUNTS.slice(0, 6));
}
