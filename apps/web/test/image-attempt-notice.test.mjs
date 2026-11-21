import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ImageAttemptNotice, { closeThenReserve, imageAttemptCopy, runImageAttemptPrimary } from '../studio/image-attempt-notice.tsx';

const banned = /custo|cobran|unknown|HTTP|provedor/i;
const visible = html => html.replace(/<[^>]+>/g, ' ');

function render(screen) {
  return renderToStaticMarkup(React.createElement(ImageAttemptNotice, {
    screen,
    onContinueEditing() {},
    onAdjustDescription() {},
    onClose: async () => {},
    onReserve: async () => {},
  }));
}

test('os três motivos mostram o texto combinado e no máximo um botão amarelo', async () => {
  const running = render({ reason: 'running_with_lease', sameProject: true });
  const limited = render({ reason: 'provider_rejected_429', sameProject: true });
  const refused = render({ reason: 'provider_rejected_400', sameProject: true });
  const uncertain = render({ reason: 'result_unknown', sameProject: true });
  assert.match(running, new RegExp(imageAttemptCopy.running));
  assert.match(running, new RegExp(imageAttemptCopy.continueEditing));
  assert.equal((running.match(/image-attempt-primary/g) ?? []).length, 0);
  assert.match(limited, new RegExp(imageAttemptCopy.rejected429));
  assert.match(limited, new RegExp(imageAttemptCopy.retry));
  assert.equal((limited.match(/image-attempt-primary/g) ?? []).length, 1);
  assert.doesNotMatch(limited, new RegExp(imageAttemptCopy.adjust));
  assert.match(refused, new RegExp(imageAttemptCopy.rejected400));
  assert.match(refused, new RegExp(imageAttemptCopy.retry));
  assert.match(refused, new RegExp(imageAttemptCopy.adjust));
  assert.equal((refused.match(/image-attempt-primary/g) ?? []).length, 1);
  assert.match(uncertain, new RegExp(imageAttemptCopy.uncertain));
  assert.match(uncertain, new RegExp(imageAttemptCopy.closeAndRetry));
  assert.match(uncertain, new RegExp(imageAttemptCopy.details));
  assert.equal((uncertain.match(/image-attempt-primary/g) ?? []).length, 1);
  for (const html of [running, limited, refused, uncertain]) assert.doesNotMatch(visible(html), banned);
  const css = await readFile(new URL('../studio/studio-shell.css', import.meta.url), 'utf8');
  assert.match(css, /\.image-attempt-notice :is\(button, a\) \{ min-height: 44px; \}/);
  assert.match(css, /\.image-attempt-notice \.image-attempt-primary \{[^}]*background: #f6d550;/);
  assert.match(css, /\.image-attempt-notice \{[^}]*background: #f4f0e5;[^}]*color: #2c2d2f;/);
  const chat = await readFile(new URL('../studio/studio-chat.tsx', import.meta.url), 'utf8');
  assert.match(chat, /A revisão de imagem reteve esta proposta\. Seu post foi preservado\./);
  assert.match(chat, /A revisão da imagem ficou inconclusiva\. Seu post foi preservado\./);
});

test('outro projeto mostra onde a imagem está e não usa o botão amarelo', () => {
  const html = render({ reason: 'result_unknown', sameProject: false, projectTitle: 'Oficina Norte', openHref: '/projetos/00000000-0000-4000-8000-000000000002' });
  assert.match(html, /Uma imagem do projeto Oficina Norte ainda não terminou/);
  assert.match(html, />Abrir</);
  assert.equal((html.match(/image-attempt-primary/g) ?? []).length, 0);
  assert.doesNotMatch(visible(html), banned);
});

test('encerrar e tentar de novo fecha antes da reserva nova e não reutiliza o pedido', async () => {
  const previous = '00000000-0000-4000-8000-000000000010';
  const created = '00000000-0000-4000-8000-000000000011';
  const order = [];
  const id = await runImageAttemptPrimary('result_unknown', {
    close: async () => { order.push('close'); },
    reserve: async requestId => { order.push(requestId); },
    createId: () => created,
  });
  assert.deepEqual(order, ['close', created]);
  assert.notEqual(id, previous);
  const retried = [];
  await runImageAttemptPrimary('provider_rejected_400', {
    close: async () => { throw Error('uma recusa já encerrada não chama o encerramento de novo'); },
    reserve: async requestId => { retried.push(requestId); },
    createId: () => created,
  });
  assert.deepEqual(retried, [created]);
  assert.equal(await closeThenReserve(async () => {}, async () => {}, () => created), created);
});
