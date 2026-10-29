import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createPreviewServer } from './preview_server.mjs';

const python = '/Users/matheusborges/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
const workerPath = fileURLToPath(new URL('./preview_worker.py', import.meta.url));
const renderer = fileURLToPath(new URL('../render/renderer.py', import.meta.url));
const hash = raw => createHash('sha256').update(raw).digest('hex');
const piece = { piece_id:'test',version:'v1',width_px:1080,height_px:1080,layers:[{
  id:'background',name:'Fundo',kind:'shape',z_index:0,rect:{x:0,y:0,width:1,height:1},shape:'rectangle',fill_hex:'#F4EBDD',
}] };

async function fixture() {
  const root = await mkdtemp(join(tmpdir(),'compor-preview-test-'));
  const contextPath = join(root,'context.json');
  const config = {assets:{},output_root:join(root,'evidence'),renderer_sha256:hash(await readFile(renderer))};
  const raw = JSON.stringify(config);
  await writeFile(contextPath,raw);
  const server = await createPreviewServer({contextPath,contextSha256:hash(raw),python,workerPath,workerSha256:hash(await readFile(workerPath))});
  const client = new Client({name:'preview-test',version:'1'});
  const [a,b] = InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a);
  return {client,root,contextPath,config,close:async()=>{await client.close();await server.close();await rm(root,{recursive:true,force:true});}};
}

test('experimental MCP returns actual PNG and safe diagnostics; two attempts survive calls', async()=>{
  const f=await fixture();
  try {
    const catalog=await f.client.listTools();assert.equal(catalog.tools.length,7);
    assert.equal(catalog.tools.find(t=>t.name==='preview_creative').annotations.readOnlyHint,false);
    for (let n=1;n<=2;n++) {
      const result=await f.client.callTool({name:'preview_creative',arguments:{slot:'D1',piece}});
      assert.equal(result.isError,undefined);
      assert.equal(result.structuredContent.status,'rendered');assert.equal(result.structuredContent.attempt,n);
      const img=result.content.find(x=>x.type==='image');assert.ok(img);
      assert.equal(Buffer.from(img.data,'base64').subarray(0,8).toString('hex'),'89504e470d0a1a0a');
      assert.equal(JSON.stringify(result.structuredContent).includes(f.root),false);
      assert.equal(JSON.stringify(result.structuredContent).includes('preview_path'),false);
    }
    const denied=await f.client.callTool({name:'preview_creative',arguments:{slot:'D1',piece}});
    assert.equal(denied.isError,true);assert.equal(denied.structuredContent.status,'budget_exhausted');
    assert.equal(denied.content.some(x=>x.type==='image'),false);
  } finally {await f.close();}
});

test('invalid render is an explicit error without fabricated image',async()=>{
  const f=await fixture();
  try {
    const invalid={...piece,layers:[{...piece.layers[0],rect:{x:0,y:0,width:1080,height:1080}}]};
    const result=await f.client.callTool({name:'preview_creative',arguments:{slot:'D2',piece:invalid}});
    assert.equal(result.isError,true);assert.equal(result.structuredContent.status,'failed');
    assert.equal(result.content.some(x=>x.type==='image'),false);
    assert.equal(JSON.stringify(result).includes(f.root),false);
  } finally {await f.close();}
});

test('changed host context is blocked before worker invocation',async()=>{
  const f=await fixture();
  try {
    await writeFile(f.contextPath,JSON.stringify({...f.config,assets:{forged:{path:'/etc/passwd',sha256:'0'.repeat(64)}}}));
    const result=await f.client.callTool({name:'preview_creative',arguments:{slot:'D1',piece}});
    assert.equal(result.isError,true);assert.equal(result.content.some(x=>x.type==='image'),false);
    assert.deepEqual(await readdir(f.root),['context.json']);
    assert.equal(JSON.stringify(result).includes('/etc/passwd'),false);
  } finally {await f.close();}
});

test('agent cannot pass asset maps or paths outside piece through the MCP schema',async()=>{
  const f=await fixture();
  try {
    const result=await f.client.callTool({name:'preview_creative',arguments:{slot:'D1',piece,assets:{x:'/etc/passwd'}}});
    assert.equal(result.isError,true);assert.equal(result.content.some(x=>x.type==='image'),false);
    assert.deepEqual(await readdir(f.root),['context.json']);
  } finally {await f.close();}
});
