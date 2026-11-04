import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';

test('rota Next de MCP delegado falha fechada e não aceita credencial sem envelope', async t => {
 const socket=createServer(); await new Promise(r=>socket.listen(0,'127.0.0.1',r)); const port=socket.address().port; await new Promise(r=>socket.close(r));
 const origin=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','-p',String(port),'-H','127.0.0.1'],{stdio:'ignore',env:{...process.env,APP_ORIGIN:origin,SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fake',COMPOR_AGENT_MCP_ENABLED:'true',COMPOR_AGENT_MCP_KEY:Buffer.alloc(32,5).toString('base64url')}});
 t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await once(child,'exit');}});
 const url=`${origin}/api/agent-mcp`,deadline=Date.now()+30000;let response;
 while(true){try{response=await fetch(url,{headers:{authorization:'Bearer not-a-valid-envelope'}});break;}catch{}if(Date.now()>deadline)throw Error('app unavailable');await new Promise(r=>setTimeout(r,200));}
 assert.equal(response.status,401); assert.equal(response.headers.get('cache-control'),'no-store');
 assert.doesNotMatch(await response.text(),/not-a-valid-envelope|sb_publishable_fake/);
});
