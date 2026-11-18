import type { NextApiRequest, NextApiResponse } from 'next';
import {NextRequest} from 'next/server';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { outgoingCookies, withRequestCookies } from './pages-request-cookies.ts';

type Handler = (request: Request, context: {params: Promise<{operation: string}>}) => Response | Promise<Response>;
type Methods = Partial<Record<'GET'|'HEAD'|'PUT'|'POST'|'DELETE'|'PATCH'|'OPTIONS',Handler>>;
const validMethods = ['GET','HEAD','PUT','POST','DELETE','PATCH','OPTIONS'] as const;
type HttpMethod = typeof validMethods[number];
const isHttpMethod = (method: string): method is HttpMethod => validMethods.some(value=>value===method);

function incomingBody(req: NextApiRequest): ReadableStream<Uint8Array> {
  // Cancelling the Web reader discards the rest of this body without closing the response socket.
  let detach=()=>{};
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const leave = () => {
        req.off('data', data); req.off('end', end); req.off('aborted', aborted); req.off('error', fail);
      };
      function data(value: Buffer) { controller.enqueue(value); if ((controller.desiredSize??0)<=0) req.pause(); }
      function end() { leave(); controller.close(); }
      function fail(error: Error) { leave(); controller.error(error); }
      function aborted() { fail(new Error('Request aborted')); }
      req.pause();
      req.on('data',data).once('end',end).once('aborted',aborted).once('error',fail);
      detach=leave;
    },
    pull() { req.resume(); },
    cancel() { detach(); req.resume(); },
  });
}

function normalizeRequestUrl(req: NextApiRequest, route: string) {
  // Use the configured deployment origin, or the local listener for an unconfigured instance.
  // An absolute request-target, Host or forwarding header cannot override the redirect origin.
  const localOrigin = 'http://localhost' + (req.socket.localPort ? ':' + req.socket.localPort : '');
  let base = localOrigin;
  try {
    const configured = new URL(process.env.APP_ORIGIN || localOrigin);
    if (['https:','http:'].includes(configured.protocol) && !configured.username && !configured.password) base = configured.origin;
  } catch { /* The original handlers return their own configuration error. */ }
  const target = new URL(req.url || '/',localOrigin);
  const url = new URL(base);
  url.search = target.search;
  const dynamic = route.endsWith('/[operation]');
  const operation = dynamic ? decodeURIComponent(target.pathname.split('/').filter(Boolean).at(-1) || '') : '';
  url.pathname = dynamic ? route.replace('[operation]',encodeURIComponent(operation)) : route;
  return {url,operation};
}

export function pagesRoute(route: string, handlers: Methods) {
  return async function dispatch(req: NextApiRequest,res: NextApiResponse) {
    const method=req.method || 'GET';
    if(!isHttpMethod(method)){res.statusCode=400;res.end();return;}
    const handler=handlers[method] || (method==='HEAD' ? handlers.GET : undefined);
    if(!handler){
      if(method==='OPTIONS'){
        const allow=new Set(validMethods.filter(value=>handlers[value]));
        allow.add('OPTIONS'); if(allow.has('GET'))allow.add('HEAD');
        res.setHeader('Allow',[...allow].sort().join(', ')); res.statusCode=204;
      }else res.statusCode=405;
      res.end();return;
    }
    const {url,operation}=normalizeRequestUrl(req,route);
    const headers=new Headers();
    for(let i=0;i<req.rawHeaders.length;i+=2)headers.append(req.rawHeaders[i],req.rawHeaders[i+1]);
    const controller=new AbortController();
    const abort=()=>{if(!res.writableFinished)controller.abort();};
    req.once('aborted',abort);res.once('close',abort);
    try{
      const init:NonNullable<ConstructorParameters<typeof NextRequest>[1]> & {duplex?:'half'}={method,headers,signal:controller.signal};
      if(method!=='GET'&&method!=='HEAD'){init.body=incomingBody(req);init.duplex='half';}
      const request=new NextRequest(url,init);
      await withRequestCookies(headers,async changed=>{
        const output=await handler(request,{params:Promise.resolve({operation})});
        res.statusCode=output.status;
        if(output.statusText)res.statusMessage=output.statusText;
        for(const [name,value] of output.headers)if(name!=='set-cookie')res.setHeader(name,value);
        const setCookies=outgoingCookies(output.headers,changed);
        if(setCookies.length)res.setHeader('set-cookie',setCookies);
        if(!output.body||method==='HEAD'){if(output.body)await output.body.cancel();res.end();return;}
        await pipeline(Readable.fromWeb(output.body as import('node:stream/web').ReadableStream<Uint8Array>),res);
      });
    }finally{req.off('aborted',abort);res.off('close',abort);}
  };
}
