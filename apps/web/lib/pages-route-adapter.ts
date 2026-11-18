import type { NextApiRequest, NextApiResponse } from 'next';
import { NextRequest } from 'next/server';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeWebStream } from 'node:stream/web';
import { outgoingCookies, withRequestCookies } from './pages-request-cookies.ts';

const validMethods = ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH', 'OPTIONS'] as const;
type Method = typeof validMethods[number];
type Context = { params: Promise<{ operation: string }> };
type Handler = (request: Request, context: Context) => Response | Promise<Response>;
type Methods = Partial<Record<Method, Handler>>;

function isMethod(name: string): name is Method {
  return validMethods.some(method => method === name);
}

function incomingBody(req: NextApiRequest) {
  let detach = () => {};
  function release() {
    detach();
    if (!req.destroyed && !req.readableEnded) req.resume();
  }
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      function data(value: Buffer) {
        controller.enqueue(value);
        if ((controller.desiredSize ?? 0) <= 0) req.pause();
      }
      function end() { detach(); controller.close(); }
      function fail(error: Error) { detach(); controller.error(error); }
      function aborted() { fail(new Error('Request aborted')); }
      detach = () => {
        req.off('data', data);
        req.off('end', end);
        req.off('aborted', aborted);
        req.off('error', fail);
      };
      if (req.readableEnded) { end(); return; }
      if (req.destroyed) { aborted(); return; }
      req.pause();
      req.on('data', data).once('end', end).once('aborted', aborted).once('error', fail);
    },
    pull() { req.resume(); },
    // A handler may stop at a size limit and still needs the socket to return its response.
    cancel: release,
  });
  return { stream, release };
}

function requestAddress(req: NextApiRequest, route: string) {
  // Keep the redirect origin independent of the incoming Host, forwarded headers and absolute target.
  const localOrigin = 'http://localhost' + (req.socket.localPort ? ':' + req.socket.localPort : '');
  let base = localOrigin;
  try {
    const configured = new URL(process.env.APP_ORIGIN || localOrigin);
    if (['https:', 'http:'].includes(configured.protocol) && !configured.username && !configured.password) {
      base = configured.origin;
    }
  } catch { /* The application handler decides how to report a missing configuration. */ }
  const target = new URL(req.url || '/', localOrigin);
  const url = new URL(base);
  url.search = target.search;
  const dynamic = route.endsWith('/[operation]');
  const operation = dynamic ? decodeURIComponent(target.pathname.split('/').filter(Boolean).at(-1) || '') : '';
  url.pathname = dynamic ? route.replace('[operation]', encodeURIComponent(operation)) : route;
  return { url, operation };
}

function autoResponse(res: NextApiResponse, method: Method, handlers: Methods) {
  if (method === 'OPTIONS') {
    const allow = new Set(validMethods.filter(value => handlers[value]));
    allow.add('OPTIONS');
    if (allow.has('GET')) allow.add('HEAD');
    res.setHeader('Allow', [...allow].sort().join(', '));
    res.statusCode = 204;
  } else {
    res.statusCode = 405;
  }
  res.end();
}

async function send(res: NextApiResponse, method: Method, output: Response, changed: Headers) {
  res.statusCode = output.status;
  if (output.statusText) res.statusMessage = output.statusText;
  for (const [name, value] of output.headers) {
    if (name !== 'set-cookie') res.setHeader(name, value);
  }
  const cookies = outgoingCookies(output.headers, changed);
  if (cookies.length) res.setHeader('set-cookie', cookies);
  if (!output.body || method === 'HEAD') {
    void output.body?.cancel().catch(() => {});
    res.end();
    return;
  }
  await pipeline(Readable.fromWeb(output.body as NodeWebStream<Uint8Array>), res);
}

export function pagesRoute(route: string, handlers: Methods) {
  return async function dispatch(req: NextApiRequest, res: NextApiResponse) {
    const method = req.method || 'GET';
    if (!isMethod(method)) { res.statusCode = 400; res.end(); return; }
    const handler = handlers[method] || (method === 'HEAD' ? handlers.GET : undefined);
    if (!handler) { autoResponse(res, method, handlers); return; }
    const { url, operation } = requestAddress(req, route);
    const headers = new Headers();
    // Node combines incoming Cookie fields with a semicolon and applies HTTP's duplicate-header rules.
    for (const [name, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) value.forEach(item => headers.append(name, item));
      else if (value !== undefined) headers.append(name, value);
    }
    const controller = new AbortController();
    const abort = () => { if (!res.writableFinished) controller.abort(); };
    req.once('aborted', abort);
    res.once('close', abort);
    const body = method !== 'GET' && method !== 'HEAD' ? incomingBody(req) : undefined;
    try {
      const request = new NextRequest(url, {
        method, headers, signal: controller.signal, ...(body && { body: body.stream, duplex: 'half' }),
      });
      await withRequestCookies(headers, async changed => {
        const output = await handler(request, { params: Promise.resolve({ operation }) });
        await send(res, method, output, changed);
      });
    } finally {
      body?.release();
      req.off('aborted', abort);
      res.off('close', abort);
    }
  };
}
