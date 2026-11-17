// Run from any directory with Node >=22.13 and the apps/web dependencies installed.
import assert from 'node:assert/strict';
import {searchReferences} from '../../../../apps/web/lib/reference-exploration.ts';
import {cases, heldOut, standardBoard} from './cases.mjs';

const projectId = '00000000-0000-4000-8000-000000000001';
const origin = id => 'https://www.pinterest.com/pin/' + id + '/';
const preview = id => 'https://i.pinimg.com/236x/' + id + '.jpg';
function feedXml(entries) {
  return '<rss><channel>' + entries.map(([id,title]) =>
    '<item><title><![CDATA[' + title + ']]></title><link>' + origin(id) +
    '</link><description><![CDATA[<img src="' + preview(id) + '">]]></description></item>'
  ).join('') + '</channel></rss>';
}

function signal(id, action, board, pinId) {
  return {id:'00000000-0000-4000-8000-' + String(id).padStart(12,'0'), action, board, projectId,
    originUrl:origin(pinId), supersedes:null, createdAt:'2026-11-01T12:00:00.000Z', comment:''};
}

assert.equal(process.argv.length, 2, 'Run without arguments for the PR baseline');

for (const testCase of [...cases,heldOut]) {
  const history = (testCase.history ?? []).map(({id,title,approvedVersions,day}) => ({
    id,title,board:standardBoard,originUrl:origin(id),previewUrl:preview(id),approvedVersions,
    selectedAt:'2026-10-' + String(day).padStart(2,'0') + 'T12:00:00.000Z',
  }));
  const signals = [];
  if (testCase.selectedBoard) {
    // Two positive signals keep the preferred board ahead even with one explicit rejection.
    signals.push(signal(1,'selected',testCase.selectedBoard,'9991'),signal(2,'selected',testCase.selectedBoard,'9992'));
  }
  if (testCase.rejected) signals.push(signal(3,'rejected',testCase.selectedBoard ?? standardBoard,testCase.rejected));
  const boards = [];
  const result = await searchReferences({
    projectId,query:testCase.brief,signals,history,
    fetchApi: async url => {
      const board = new URL(url).pathname.slice(1,-4);
      boards.push(board);
      return testCase.unavailable ? new Response(null,{status:503}) : new Response(feedXml(testCase.feeds[board] ?? []));
    },
  });
  const known = new Set(history.map(item=>item.originUrl));
  // Applied by the studio when the separate history groups have loaded.
  const discovery = result.references.filter(item=>!known.has(item.originUrl));
  const firstFour = discovery.slice(0,4);
  assert.equal(new Set(result.references.map(item=>item.id)).size,result.references.length);
  if (testCase.rejected) assert.ok(result.references.every(item=>item.id!==testCase.rejected));
  console.log(JSON.stringify({case:testCase.id,status:result.status,boards,history:history.length,
    returned:result.references.length,suggestions:discovery.length,firstFour:firstFour.map(({id,title})=>({id,title})),
    useful:firstFour.filter(item=>testCase.useful.includes(item.id)).length}));
}
