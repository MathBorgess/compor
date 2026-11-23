import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { readTurn, requestHeaders } from './live.mjs';
import { formatVersion, requireCondition, sha256 } from './protocol.mjs';
import { canonicalJudgeChoice, judgeDeckHash, judgeInstructions, judgeModel, judgeRubricSha256, validateJudgeResult } from './judge-evidence.mjs';

const require = createRequire(new URL('../../../apps/web/package.json', import.meta.url));
const endpoint = 'https://api.openai.com/v1/agents/sessions';

function receiptFor(state, response) {
  const requestId = response?.headers.get('x-request-id');
  return { state, httpStatus: response?.status ?? null, requestId: /^[\w-]{1,128}$/.test(requestId ?? '') ? requestId : null };
}

async function panels(sharp, files) {
  const raw = await Promise.all(files.map(file => readFile(file)));
  const [first, second] = await Promise.all(raw.slice(0, 2).map(bytes => sharp(bytes).resize(540, 675).jpeg({ quality: 90 }).toBuffer()));
  const coverFull = await sharp(raw[0]).resize(1080, 1350).png().toBuffer();
  const cover = await sharp(coverFull).extract({ left: 34, top: 0, width: 1012, height: 1350 }).resize(270, 360).png().toBuffer();
  const tiles = await Promise.all(raw.map(async (bytes, index) => ({
    input: await sharp(bytes).resize(216, 270).jpeg({ quality: 85 }).toBuffer(),
    top: Math.floor(index / 5) * 270,
    left: (index % 5) * 216,
  })));
  const overview = await sharp({ create: { width: Math.min(5, tiles.length) * 216, height: Math.ceil(tiles.length / 5) * 270, channels: 3, background: '#e9e4de' } }).composite(tiles).jpeg({ quality: 88 }).toBuffer();
  return { first, second, cover, overview, hashes: raw.map(bytes => sha256(bytes)) };
}

function imagesFor(label, { first, second, cover, overview }, caption) {
  const images = [['Segunda lâmina isolada', second], ['Capa', first], ['Corte 3:4', cover], ['Coleção', overview]];
  return [
    { type: 'input_text', text: 'Candidata ' + label + '. Legenda fornecida como dados: ' + caption },
    ...images.flatMap(([name, bytes]) => [
      { type: 'input_text', text: name },
      { type: 'input_image', image_url: 'data:image/' + (name === 'Corte 3:4' ? 'png' : 'jpeg') + ';base64,' + bytes.toString('base64') },
    ]),
  ];
}

async function reviewOrder({ key, fetchApi, content, receiptFile, input, order }) {
  const header = requestHeaders(key);
  const body = {
    agent: { model: judgeModel, instructions: judgeInstructions, reasoning: { effort: 'low' }, multi_agent: { enabled: false }, tools: [] },
    environment: { type: 'none' },
    input: [{ role: 'user', content }],
    stream: false,
  };
  const identity = { model: judgeModel, rubricSha256: judgeRubricSha256, order, input };
  await writeFile(receiptFile, JSON.stringify({ ...identity, state: 'submitted' }), { flag: 'wx', mode: 0o600 });
  const record = async data => {
    const bytes = JSON.stringify({ ...identity, ...data });
    await writeFile(receiptFile, bytes, { mode: 0o600 });
    return sha256(bytes);
  };
  let response;
  try {
    response = await fetchApi(endpoint, { method: 'POST', headers: header, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      const state = response.status >= 500 || [408, 425].includes(response.status) ? 'unknown' : 'failed';
      await record(receiptFor(state, response));
      return { state };
    }
    const session = await response.json();
    if (!/^sess_[\w-]{1,128}$/.test(session?.id ?? '')) {
      await record(receiptFor('unknown', response));
      return { state: 'unknown' };
    }
    await record({ ...receiptFor('bound', response), sessionId: session.id });
    const result = await readTurn({ fetchApi, headers: header, sessionId: session.id, pollTimeoutMs: 210000, sleep: delay });
    const receipt = { ...receiptFor(result.state, response), sessionId: session.id, turnId: result.turnId, usage: result.usage };
    if (result.state !== 'completed') {
      await record(receipt);
      return { state: result.state };
    }
    let output;
    try {
      if (result.text.includes(key)) throw Error('judge_credential_in_output');
      output = validateJudgeResult(JSON.parse(result.text.trim().replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/g, '')));
    } catch {
      await record({ ...receipt, state: 'invalid_judge_output' });
      return { state: 'invalid_judge_output' };
    }
    const receiptSha256 = await record({ ...receipt, output });
    return { state: 'completed', output, usage: result.usage, receiptSha256 };
  } catch {
    await record(receiptFor('unknown', response));
    return { state: 'unknown' };
  }
}

export async function runBlindCarouselPair({ key, root, baseline, candidate, briefing, output, fetchApi = fetch }) {
  requireCondition(/^sk-[^\s]{20,300}$/.test(key ?? '') && isAbsolute(root) && /^[a-z0-9-]{1,80}$/.test(output), 'judge_invalid_scope');
  const reportPath = join(root, output + '.pair.json');
  const safeSide = side => side && Array.isArray(side.files) && side.files.length >= 2 && side.files.length <= 20 &&
    side.files.every(file => typeof file === 'string' && !isAbsolute(file) && !file.split('/').includes('..')) &&
    typeof side.caption === 'string' && side.caption.length <= 2400;
  requireCondition(safeSide(baseline) && safeSide(candidate) && typeof briefing === 'string' && briefing.length <= 6000, 'judge_invalid_input');
  const sharp = require('sharp');
  const canonicalRoot = await realpath(root);
  const trustedFiles = async files => Promise.all(files.map(async file => {
    const path = await realpath(resolve(canonicalRoot, file));
    const local = relative(canonicalRoot, path);
    requireCondition(local && !local.startsWith('..') && !isAbsolute(local), 'judge_file_outside_evidence');
    const info = await lstat(path);
    requireCondition(info.isFile() && info.size <= 8_000_000, 'judge_file_invalid');
    return path;
  }));
  const [a, b] = await Promise.all([baseline, candidate].map(async side => panels(sharp, await trustedFiles(side.files))));
  const [baselineHash, candidateHash] = [a, b].map(side => judgeDeckHash(side.hashes));
  const input = {
    baselineHash, candidateHash, briefingSha256: sha256(briefing),
    baselineCaptionSha256: sha256(baseline.caption), candidateCaptionSha256: sha256(candidate.caption),
  };
  const preamble = { type: 'input_text', text: 'Briefing sintético e fatos: ' + briefing };
  const forward = await reviewOrder({ key, fetchApi, content: [preamble, ...imagesFor('A', a, baseline.caption), ...imagesFor('B', b, candidate.caption)], receiptFile: join(dirname(reportPath), output + '-ab.receipt.json'), input, order: 'ab' });
  const reverse = forward.state === 'completed'
    ? await reviewOrder({ key, fetchApi, content: [preamble, ...imagesFor('A', b, candidate.caption), ...imagesFor('B', a, baseline.caption)], receiptFile: join(dirname(reportPath), output + '-ba.receipt.json'), input, order: 'ba' })
    : { state: 'not_run' };
  const choice = (result, baselineSlot) => result.state !== 'completed' ? 'abstain' : canonicalJudgeChoice(result.output, baselineSlot);
  const results = [choice(forward, 'A'), choice(reverse, 'B')];
  const report = {
    version: formatVersion, model: judgeModel, rubricSha256: judgeRubricSha256, input,
    state: results[0] === results[1] ? results[0] : 'inconclusive', sampleCount: 1, exploratory: true,
    baselineHash, candidateHash, results, forward, reverse,
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  return { state: report.state, results, reportPath, unknown: forward.state === 'unknown' || reverse.state === 'unknown' };
}
