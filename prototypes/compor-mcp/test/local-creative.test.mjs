import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, symlink, unlink, mkdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { LocalCreativeStore, registerLocalCreativeTools } from '../dist/creative/local_creative.js';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const initial = [{id:'title',text:'Título inicial',x:0.05,y:0.1,font_size_px:40,color_hex:'#122334',font_family:'serif'},{id:'cta',text:'Saiba mais',x:0.05,y:0.7,font_size_px:20,color_hex:'#123456',font_family:'sans-serif'}];
async function fixture(fn) {
  const root=await mkdtemp(join(tmpdir(),'compor-local-creative-test-'));
  try { await fn(root); } finally { await rm(root,{recursive:true,force:true}); }
}

test('create/edit/read retains original base and immutable versions, escaping untrusted text', async () => fixture(async root => {
  const store=new LocalCreativeStore(root,'owner');
  const first=await store.create('owner',{base_png_base64:png,layers:initial});
  const firstSvg=await readFile(first.svg_path,'utf8');
  const edited=await store.edit('owner',{piece_id:first.snapshot.piece_id,expected_version_id:first.snapshot.version_id,layer_id:'title',text:'<script>alert(1)</script> & revisão'});
  assert.equal(edited.snapshot.revision,2);
  assert.equal(edited.snapshot.parent_version_id,first.snapshot.version_id);
  assert.equal(edited.previous_text,'Título inicial');
  assert.equal(edited.snapshot.base_sha256,first.snapshot.base_sha256);
  assert.equal(edited.snapshot.layers[1].text,'Saiba mais');
  const svg=await readFile(edited.svg_path,'utf8');
  assert.match(svg,/&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; revisão/);
  assert.doesNotMatch(svg,/<script>/);
  assert.equal(await readFile(first.svg_path,'utf8'),firstSvg);
  const older=await store.read('owner',first.snapshot.piece_id,first.snapshot.version_id);
  const latest=await store.read('owner',first.snapshot.piece_id);
  assert.equal(older.snapshot.layers[0].text,'Título inicial');
  assert.equal(latest.snapshot.layers[0].text,'<script>alert(1)</script> & revisão');
  assert.equal(latest.history.length,2);
  const restarted=new LocalCreativeStore(root,'owner');
  assert.equal((await restarted.read('owner',first.snapshot.piece_id,first.snapshot.version_id)).snapshot.layers[0].text,'Título inicial');
  assert.equal((await restarted.read('owner',first.snapshot.piece_id)).snapshot.version_id,edited.snapshot.version_id);
  await assert.rejects(store.edit('owner',{piece_id:first.snapshot.piece_id,expected_version_id:first.snapshot.version_id,layer_id:'title',text:'stale'}),/versão mudou/);
  assert.equal((await store.read('owner',first.snapshot.piece_id)).history.length,2);
}));

test('centered text anchors survive edits while prior versions keep their original SVG', async () => fixture(async root => {
  const store = new LocalCreativeStore(root, 'owner');
  const first = await store.create('owner', { base_png_base64: png, layers: [{ ...initial[0], x: .5, text_anchor: 'middle' }] });
  const svg = await readFile(first.svg_path, 'utf8');
  assert.match(svg, /text-anchor="middle"/);
  const next = await store.edit('owner', { piece_id: first.snapshot.piece_id, expected_version_id: first.snapshot.version_id, layer_id: 'title', text: 'Revisado' });
  assert.equal(next.snapshot.layers[0].text_anchor, 'middle');
  assert.equal(await readFile(first.svg_path, 'utf8'), svg);
  assert.match(await readFile(next.svg_path, 'utf8'), /text-anchor="middle"/);
}));

test('limited typographic emphasis is preserved by edits and rejects unsafe rotations', async () => fixture(async root => {
  const store = new LocalCreativeStore(root, 'owner');
  const style = { ...initial[0], font_weight: 'bold', font_style: 'italic', rotate_deg: -3 };
  const first = await store.create('owner', { base_png_base64: png, layers: [style] });
  const result = await store.edit('owner', { piece_id: first.snapshot.piece_id, expected_version_id: first.snapshot.version_id, layer_id: 'title', text: 'Revisado' });
  const svg = await readFile(result.svg_path, 'utf8');
  assert.match(svg, /font-weight="bold" font-style="italic" transform="rotate\(-3 /);
  assert.equal(result.snapshot.layers[0].rotate_deg, -3);
  await assert.rejects(store.create('owner', { base_png_base64: png, layers: [{ ...style, rotate_deg: 90 }] }));
}));

test('caption provenance and revisions survive restart without modifying base, art, or old snapshots', async () => fixture(async root => {
  const store = new LocalCreativeStore(root, 'alice');
  const base = await store.create('alice', { base_png_base64: png, layers: initial });
  assert.equal(base.snapshot.caption, undefined, 'older snapshots have no caption');
  const svg = await readFile(base.svg_path);
  const proposal = await store.setCaption('alice', { piece_id: base.snapshot.piece_id, expected_version_id: base.snapshot.version_id, caption: { text: 'Conheça a ideia.\n\nVocê teria interesse?', origin: 'agent_proposal' } });
  assert.equal(proposal.previous_caption, null);
  assert.equal(proposal.snapshot.caption.origin, 'agent_proposal');
  assert.equal(proposal.snapshot.base_sha256, base.snapshot.base_sha256);
  assert.deepEqual(proposal.snapshot.layers, base.snapshot.layers);
  assert.deepEqual(await readFile(proposal.svg_path), svg);
  assert.deepEqual(await readFile(base.svg_path), svg);
  const personal = await store.setCaption('alice', { piece_id: base.snapshot.piece_id, expected_version_id: proposal.snapshot.version_id, caption: { text: 'Minha versão.\nUma segunda linha.', origin: 'person' } });
  assert.deepEqual(personal.previous_caption, proposal.snapshot.caption);
  assert.equal(personal.snapshot.parent_version_id, proposal.snapshot.version_id);
  const edited = await store.edit('alice', { piece_id: base.snapshot.piece_id, expected_version_id: personal.snapshot.version_id, layer_id: 'title', text: 'Novo título' });
  assert.deepEqual(edited.snapshot.caption, personal.snapshot.caption);
  const restored = new LocalCreativeStore(root, 'alice');
  assert.equal((await restored.read('alice', base.snapshot.piece_id, base.snapshot.version_id)).snapshot.caption, undefined);
  assert.deepEqual((await restored.read('alice', base.snapshot.piece_id, proposal.snapshot.version_id)).snapshot.caption, proposal.snapshot.caption);
  assert.deepEqual((await restored.read('alice', base.snapshot.piece_id)).snapshot.caption, personal.snapshot.caption);
  await assert.rejects(store.setCaption('alice', { piece_id: base.snapshot.piece_id, expected_version_id: proposal.snapshot.version_id, caption: { text: 'stale', origin: 'person' } }), /versão mudou/);
  await assert.rejects(store.setCaption('bob', { piece_id: base.snapshot.piece_id, expected_version_id: edited.snapshot.version_id, caption: { text: 'other', origin: 'person' } }), /não autorizada/);
  const bob = new LocalCreativeStore(root, 'bob');
  await assert.rejects(bob.read('bob', base.snapshot.piece_id));
  await assert.rejects(store.setCaption('alice', { piece_id: base.snapshot.piece_id, expected_version_id: edited.snapshot.version_id, caption: { text: ' ', origin: 'person' } }));
  await assert.rejects(store.setCaption('alice', { piece_id: base.snapshot.piece_id, expected_version_id: edited.snapshot.version_id, caption: { text: 'bad\u0000', origin: 'person' } }));
  await assert.rejects(store.setCaption('alice', { piece_id: base.snapshot.piece_id, expected_version_id: edited.snapshot.version_id, caption: { text: 'bad', origin: 'approved' } }));
  const attempts = await Promise.allSettled(['A','B'].map(value => store.setCaption('alice', { piece_id: base.snapshot.piece_id, expected_version_id: edited.snapshot.version_id, caption: { text: value, origin: 'person' } })));
  assert.equal(attempts.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter(x => x.status === 'rejected').length, 1);
}));

test('actor isolation, traversal, invalid PNG, duplicate layers and tampering fail closed', async () => fixture(async root => {
  const alice=new LocalCreativeStore(root,'alice'), bob=new LocalCreativeStore(root,'bob');
  const piece=await alice.create('alice',{base_png_base64:png,layers:initial});
  await assert.rejects(alice.read('bob',piece.snapshot.piece_id),/não autorizada/);
  await assert.rejects(bob.read('bob',piece.snapshot.piece_id));
  await assert.rejects(alice.read('alice','../other'));
  await assert.rejects(alice.read('alice',piece.snapshot.piece_id,'../../base.png'));
  await assert.rejects(alice.create('alice',{base_png_base64:Buffer.from('not png').toString('base64'),layers:initial}),/PNG/);
  await assert.rejects(alice.create('alice',{base_png_base64:png,layers:[initial[0],initial[0]]}),/únicos/);
  await assert.rejects(alice.edit('alice',{piece_id:piece.snapshot.piece_id,expected_version_id:piece.snapshot.version_id,layer_id:'title',text:'oi\n<script>'}));
  const base=join(piece.svg_path,'..','base.png');
  await writeFile(base,Buffer.from('fake image'));
  await assert.rejects(alice.read('alice',piece.snapshot.piece_id),/Imagem base alterada/);
  await writeFile(base,Buffer.from(png,'base64'));
  await writeFile(piece.svg_path,'externally modified');
  await assert.rejects(alice.read('alice',piece.snapshot.piece_id),/Prévia local alterada/);
}));

test('symlinks are refused and overlapping edits cannot overwrite each other', async () => fixture(async root => {
  const store=new LocalCreativeStore(root,'owner');
  const first=await store.create('owner',{base_png_base64:png,layers:initial});
  const [a,b]=await Promise.allSettled(['A','B'].map(text=>store.edit('owner',{piece_id:first.snapshot.piece_id,expected_version_id:first.snapshot.version_id,layer_id:'title',text})));
  assert.equal([a,b].filter(r=>r.status==='fulfilled').length,1);
  assert.equal([a,b].filter(r=>r.status==='rejected').length,1);
  const latest=await store.read('owner',first.snapshot.piece_id);assert.equal(latest.history.length,2);
  const base=join(first.svg_path,'..','base.png');
  await unlink(base);await symlink('/etc/passwd',base);
  await assert.rejects(store.read('owner',first.snapshot.piece_id));
}));

test('local image import requires explicit consent and a host-approved direct directory, without symlinks', async () => fixture(async root => {
  const imageDir=await realpath(root), image=join(imageDir,'image.png');
  await writeFile(image,Buffer.from(png,'base64'));
  const store=new LocalCreativeStore(root,'owner',{allowedImageRoots:[imageDir]});
  const args={local_png_path:image,confirm_local_image_use:true,layers:initial};
  await assert.rejects(store.createFromFile('owner',{...args,confirm_local_image_use:false}),/não autorizado/);
  await assert.rejects(store.createFromFile('other',args),/não autorizada/);
  await assert.rejects(store.createFromFile('owner',{...args,local_png_path:'/etc/passwd'}),/fora dos diretórios/);
  await assert.rejects(store.createFromFile('owner',{...args,local_png_path:join(imageDir,'..','outside.png')}));
  const link=join(imageDir,'linked.png');await symlink(image,link);
  await assert.rejects(store.createFromFile('owner',{...args,local_png_path:link}),/insegura/);
  const nested=join(imageDir,'nested');await mkdir(nested);await writeFile(join(nested,'image.png'),Buffer.from(png,'base64'));
  await assert.rejects(store.createFromFile('owner',{...args,local_png_path:join(nested,'image.png')}),/fora dos diretórios/);
  const piece=await store.createFromFile('owner',args);
  assert.equal(piece.snapshot.base_sha256,(await store.read('owner',piece.snapshot.piece_id)).snapshot.base_sha256);
  assert.notEqual(join(imageDir,'image.png'),join(piece.svg_path,'..','base.png'));
}));

test('derived piece links the explicit historical source, without inheriting text or modifying prior versions', async () => fixture(async root => {
  const imageDir=await realpath(root), image=join(imageDir,'new-base.png');
  await writeFile(image,Buffer.from(png,'base64'));
  const store=new LocalCreativeStore(root,'alice',{allowedImageRoots:[imageDir]});
  const source=await store.create('alice',{base_png_base64:png,layers:initial});
  const sourceSvg=await readFile(source.svg_path,'utf8');
  assert.equal(source.snapshot.derived_from,undefined,'legacy/ordinary snapshots need no new field');
  const later=await store.edit('alice',{piece_id:source.snapshot.piece_id,expected_version_id:source.snapshot.version_id,layer_id:'title',text:'Versão posterior'});
  const reference={piece_id:source.snapshot.piece_id,version_id:source.snapshot.version_id};
  const child=await store.createFromFile('alice',{local_png_path:image,confirm_local_image_use:true,derived_from:reference,layers:[{...initial[0],text:'Texto independente'}]});
  assert.notEqual(child.snapshot.piece_id,source.snapshot.piece_id);
  assert.equal(child.snapshot.parent_version_id,null);
  assert.deepEqual({piece_id:child.snapshot.derived_from.piece_id,version_id:child.snapshot.derived_from.version_id},reference);
  assert.equal(child.snapshot.derived_from.base_sha256,source.snapshot.base_sha256);
  assert.match(child.snapshot.derived_from.snapshot_sha256,/^[0-9a-f]{64}$/);
  assert.deepEqual(child.snapshot.layers.map(l=>l.text),['Texto independente']);
  assert.equal(await readFile(source.svg_path,'utf8'),sourceSvg);
  assert.equal((await store.read('alice',source.snapshot.piece_id)).snapshot.version_id,later.snapshot.version_id);
  const revision=await store.edit('alice',{piece_id:child.snapshot.piece_id,expected_version_id:child.snapshot.version_id,layer_id:'title',text:'Texto corrigido'});
  assert.deepEqual(revision.snapshot.derived_from,child.snapshot.derived_from);
  const restored=new LocalCreativeStore(root,'alice',{allowedImageRoots:[imageDir]});
  assert.deepEqual((await restored.read('alice',child.snapshot.piece_id)).snapshot.derived_from,child.snapshot.derived_from);
  assert.equal((await restored.read('alice',child.snapshot.piece_id,child.snapshot.version_id)).snapshot.layers[0].text,'Texto independente');
}));

test('derivation rejects other actors, missing versions, invalid origins and altered source evidence', async () => fixture(async root => {
  const alice=new LocalCreativeStore(root,'alice'),bob=new LocalCreativeStore(root,'bob');
  const parent=await alice.create('alice',{base_png_base64:png,layers:initial});
  const origin={piece_id:parent.snapshot.piece_id,version_id:parent.snapshot.version_id};
  const args={base_png_base64:png,layers:initial,derived_from:origin};
  await assert.rejects(alice.create('bob',args),/não autorizada/);
  await assert.rejects(bob.create('bob',args));
  await assert.rejects(alice.create('alice',{...args,derived_from:{...origin,version_id:'v_'+ '0'.repeat(32)}}),/Versão indisponível/);
  await assert.rejects(alice.create('alice',{...args,derived_from:{...origin,version_id:'../bad'}}));
  const child=await alice.create('alice',args);
  const parentBase=join(parent.svg_path,'..','base.png');
  await writeFile(parentBase,Buffer.from('alterada'));
  await assert.rejects(alice.read('alice',child.snapshot.piece_id),/Imagem base alterada/);
  await assert.rejects(alice.create('alice',args),/Imagem base alterada/);
  await writeFile(parentBase,Buffer.from(png,'base64'));
  assert.equal((await alice.read('alice',child.snapshot.piece_id)).snapshot.version_id,child.snapshot.version_id);
  const childSnapshot=join(child.svg_path,'..',`snapshot_${child.snapshot.version_id}.json`);
  const saved=JSON.parse(await readFile(childSnapshot,'utf8'));
  saved.derived_from.snapshot_sha256='0'.repeat(64);
  await writeFile(childSnapshot,JSON.stringify(saved));
  await assert.rejects(alice.read('alice',child.snapshot.piece_id),/Origem local alterada/);
  saved.derived_from={...saved.derived_from,piece_id:child.snapshot.piece_id,version_id:child.snapshot.version_id};
  await writeFile(childSnapshot,JSON.stringify(saved));
  await assert.rejects(alice.read('alice',child.snapshot.piece_id),/Cadeia de origem local inválida/);
}));

test('concurrent derivations remain independent while source versions are immutable', async () => fixture(async root => {
  const store=new LocalCreativeStore(root,'owner');
  const source=await store.create('owner',{base_png_base64:png,layers:initial});
  const ref={piece_id:source.snapshot.piece_id,version_id:source.snapshot.version_id};
  const [a,b,updated]=await Promise.all([
    store.create('owner',{base_png_base64:png,layers:[{...initial[0],text:'A'}],derived_from:ref}),
    store.create('owner',{base_png_base64:png,layers:[{...initial[0],text:'B'}],derived_from:ref}),
    store.edit('owner',{piece_id:ref.piece_id,expected_version_id:ref.version_id,layer_id:'title',text:'Origem atualizada'}),
  ]);
  assert.notEqual(a.snapshot.piece_id,b.snapshot.piece_id);
  assert.equal(a.snapshot.derived_from.version_id,ref.version_id);
  assert.equal(b.snapshot.derived_from.version_id,ref.version_id);
  assert.equal((await store.read('owner',a.snapshot.piece_id)).snapshot.layers[0].text,'A');
  assert.equal((await store.read('owner',b.snapshot.piece_id)).snapshot.layers[0].text,'B');
  assert.equal((await store.read('owner',ref.piece_id)).snapshot.version_id,updated.snapshot.version_id);
}));

test('an intact historical source recovers with a warning when a later snapshot is corrupt', async () => fixture(async root => {
  const store=new LocalCreativeStore(root,'owner');
  const source=await store.create('owner',{base_png_base64:png,layers:initial});
  const second=await store.edit('owner',{piece_id:source.snapshot.piece_id,expected_version_id:source.snapshot.version_id,layer_id:'title',text:'Outra versão'});
  const child=await store.create('owner',{base_png_base64:png,layers:initial,derived_from:{piece_id:source.snapshot.piece_id,version_id:source.snapshot.version_id}});
  const laterPath=join(second.svg_path,'..',`snapshot_${second.snapshot.version_id}.json`);
  const original=await readFile(laterPath);
  await writeFile(laterPath,'invalid json');
  await assert.rejects(store.read('owner',source.snapshot.piece_id),'reading the current source must expose its corrupt history');
  const recovered=await store.read('owner',source.snapshot.piece_id,source.snapshot.version_id);
  assert.equal(recovered.snapshot.version_id,source.snapshot.version_id);
  assert.equal(recovered.history_complete,false);
  assert.match(recovered.warnings[0],/Histórico completo indisponível/);
  const derivedRead=await store.read('owner',child.snapshot.piece_id);
  assert.equal(derivedRead.snapshot.version_id,child.snapshot.version_id);
  assert.match(derivedRead.warnings[0],/Histórico completo indisponível/);
  const again=await store.create('owner',{base_png_base64:png,layers:initial,derived_from:{piece_id:source.snapshot.piece_id,version_id:source.snapshot.version_id}});
  assert.match(again.warnings[0],/Histórico completo indisponível/);
  assert.match(await readFile(source.svg_path,'utf8'),/Título inicial/);
  await writeFile(laterPath,original);
  const restored=await store.read('owner',child.snapshot.piece_id);
  assert.equal(restored.snapshot.version_id,child.snapshot.version_id);
  assert.deepEqual(restored.warnings,[]);
}));

test('derivation permits 64 levels and rejects creating an unreadably deep chain', { timeout: 30000 }, async () => fixture(async root => {
  const store=new LocalCreativeStore(root,'owner');
  let last=await store.create('owner',{base_png_base64:png,layers:[initial[0]]});
  for(let depth=2;depth<=64;depth++) {
    last=await store.create('owner',{base_png_base64:png,layers:[initial[0]],derived_from:{piece_id:last.snapshot.piece_id,version_id:last.snapshot.version_id}});
  }
  assert.equal((await store.read('owner',last.snapshot.piece_id)).snapshot.version_id,last.snapshot.version_id);
  await assert.rejects(store.create('owner',{base_png_base64:png,layers:[initial[0]],derived_from:{piece_id:last.snapshot.piece_id,version_id:last.snapshot.version_id}}),/longa demais/);
}));

test('MCP offers an actual scoped local edit and rejects cross-person access', async () => fixture(async root => {
  const imageDir=await realpath(root), image=join(imageDir,'client-source.png');
  await writeFile(image,Buffer.from(png,'base64'));
  async function connect(actor) {
    const server=new McpServer({name:'creative-test',version:'1'});
    registerLocalCreativeTools(server,actor,new LocalCreativeStore(root,actor,{allowedImageRoots:[imageDir]}));
    const client=new Client({name:'creative-test',version:'1'}), [ct,st]=InMemoryTransport.createLinkedPair();
    await server.connect(st);await client.connect(ct);return {server,client};
  }
  const a=await connect('alice'), b=await connect('bob');
  try {
    const created=await a.client.callTool({name:'creative_local_create',arguments:{base_png_base64:png,layers:initial}});
    assert.notEqual(created.isError,true,JSON.stringify(created));
    const snapshot=created.structuredContent.snapshot;
    const continuation = response => JSON.parse(response.content[1].text);
    assert.deepEqual(continuation(created), {piece_id:snapshot.piece_id,version_id:snapshot.version_id,parent_version_id:null,revision:1,layer_ids:['title','cta'],svg_path:created.structuredContent.svg_path});
    const other=await b.client.callTool({name:'creative_local_read',arguments:{piece_id:snapshot.piece_id}});
    assert.equal(other.isError,true);
    const edited=await a.client.callTool({name:'creative_local_edit_text',arguments:{piece_id:snapshot.piece_id,expected_version_id:snapshot.version_id,layer_id:'title',text:'Nova chamada'}});
    assert.notEqual(edited.isError,true,JSON.stringify(edited));
    assert.equal(continuation(edited).piece_id,snapshot.piece_id);
    assert.equal(continuation(edited).parent_version_id,snapshot.version_id);
    assert.equal(continuation(edited).version_id,edited.structuredContent.snapshot.version_id);
    const captionResult=await a.client.callTool({name:'creative_local_set_caption',arguments:{piece_id:snapshot.piece_id,expected_version_id:edited.structuredContent.snapshot.version_id,caption:{text:'Uma legenda proposta.\nVocê quer conhecer?',origin:'agent_proposal'}}});
    assert.notEqual(captionResult.isError,true,JSON.stringify(captionResult));
    assert.match(captionResult.content[0].text,/revisável e não foi publicada/);
    assert.equal(captionResult.structuredContent.snapshot.caption.origin,'agent_proposal');
    assert.equal(continuation(captionResult).version_id,captionResult.structuredContent.snapshot.version_id);
    const crossCaption=await b.client.callTool({name:'creative_local_set_caption',arguments:{piece_id:snapshot.piece_id,expected_version_id:captionResult.structuredContent.snapshot.version_id,caption:{text:'não autorizado',origin:'person'}}});
    assert.equal(crossCaption.isError,true);
    const actual=await a.client.callTool({name:'creative_local_read',arguments:{piece_id:snapshot.piece_id}});
    assert.equal(actual.structuredContent.snapshot.layers[0].text,'Nova chamada');
    assert.equal(actual.structuredContent.history.length,3);
    assert.equal(continuation(actual).version_id,actual.structuredContent.snapshot.version_id);
    assert.match(actual.structuredContent.snapshot.caption.text,/legenda proposta/);
    const refused=await a.client.callTool({name:'creative_local_create_from_file',arguments:{local_png_path:image,confirm_local_image_use:false,layers:initial}});
    assert.equal(refused.isError,true);
    const derived_from={piece_id:snapshot.piece_id,version_id:snapshot.version_id};
    const forbidden=await b.client.callTool({name:'creative_local_create_from_file',arguments:{local_png_path:image,confirm_local_image_use:true,layers:initial,derived_from}});
    assert.equal(forbidden.isError,true,'another host-bound identity cannot derive a piece it cannot read');
    const imported=await a.client.callTool({name:'creative_local_create_from_file',arguments:{local_png_path:image,confirm_local_image_use:true,layers:initial,derived_from}});
    assert.notEqual(imported.isError,true,JSON.stringify(imported));
    assert.equal(continuation(imported).piece_id,imported.structuredContent.snapshot.piece_id);
    assert.equal(imported.structuredContent.snapshot.layers[0].text,'Título inicial');
    assert.equal(imported.structuredContent.snapshot.derived_from.piece_id,snapshot.piece_id);
    assert.equal(imported.structuredContent.snapshot.derived_from.version_id,snapshot.version_id);
    const cross=await b.client.callTool({name:'creative_local_read',arguments:{piece_id:imported.structuredContent.snapshot.piece_id}});
    assert.equal(cross.isError,true);
    const laterPath=join(edited.structuredContent.svg_path,'..',`snapshot_${edited.structuredContent.snapshot.version_id}.json`);
    await writeFile(laterPath,'invalid json');
    const recover=await a.client.callTool({name:'creative_local_read',arguments:{piece_id:snapshot.piece_id,version_id:snapshot.version_id}});
    assert.notEqual(recover.isError,true,JSON.stringify(recover));
    assert.equal(recover.structuredContent.history_complete,false);
    assert.match(recover.content[0].text,/Histórico completo indisponível/);
    const unreadable=await a.client.callTool({name:'creative_local_read',arguments:{piece_id:snapshot.piece_id}});
    assert.equal(unreadable.isError,true,'the latest request must not mask corruption');
  } finally {await a.client.close();await a.server.close();await b.client.close();await b.server.close();}
}));
