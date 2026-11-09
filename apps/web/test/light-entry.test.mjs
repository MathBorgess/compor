import test from 'node:test';
import assert from 'node:assert/strict';
import { renderLightEntry, servesLightEntry } from '../lib/light-entry.ts';

const auth = { service: 'https://example.supabase.co', app: 'https://compor.example', key: 'sb_publishable_test' };
const settings = { auth, localAuth: false, studioEnabled: true };
const visit = (overrides = {}) => ({ method: 'GET', pathname: '/', cookieNames: [], ...overrides });

test('a primeira visita sem sessão recebe a entrada leve; qualquer outro caso continua no App Router', () => {
  assert.equal(servesLightEntry(visit(), settings), true);
  assert.equal(servesLightEntry(visit({ cookieNames: ['sb-example-auth-token-code-verifier', 'compor-oauth-pending', 'sb-other-auth-token'] }), settings), true);

  assert.equal(servesLightEntry(visit({ cookieNames: ['sb-example-auth-token'] }), settings), false);
  assert.equal(servesLightEntry(visit({ cookieNames: ['other', 'sb-example-auth-token.0'] }), settings), false);
  assert.equal(servesLightEntry(visit({ cookieNames: ['sb-example-auth-token.12'] }), settings), false);
  assert.equal(servesLightEntry(visit(), { ...settings, auth: null }), false);
  assert.equal(servesLightEntry(visit(), { ...settings, localAuth: true }), false);
  assert.equal(servesLightEntry(visit(), { ...settings, studioEnabled: false }), false);
  for (const method of ['POST', 'HEAD', 'PUT']) assert.equal(servesLightEntry(visit({ method }), settings), false, method);
  for (const pathname of ['/auth/session', '/oauth/consent', '/index', '/api/projects']) assert.equal(servesLightEntry(visit({ pathname }), settings), false, pathname);
});

test('o nome do cookie de sessão segue o projeto Supabase configurado', () => {
  const local = { ...settings, auth: { ...auth, service: 'https://127.0.0.1:54331' } };
  assert.equal(servesLightEntry(visit({ cookieNames: ['sb-127-auth-token'] }), local), false);
  assert.equal(servesLightEntry(visit({ cookieNames: ['sb-example-auth-token'] }), local), true);
});

test('a entrada leve é HTML completo sem script externo, com o formulário de login e o erro só quando pedido', () => {
  const html = renderLightEntry({ css: '.compor-entry{color:red}', loginError: false });
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /<html lang="pt-BR">/);
  assert.match(html, /<style>\.compor-entry\{color:red\}<\/style>/);
  assert.match(html, /<main class="compor-entry" aria-labelledby="entry-title">/);
  assert.match(html, /<h1 id="entry-title">Bom ter você por aqui\.<\/h1>/);
  assert.match(html, /<form action="\/auth\/sign-in" method="post"><button class="entry-google">Entrar com Google<\/button><\/form>/);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc=/);
  assert.doesNotMatch(html, /\bdisabled\b/);
  assert.doesNotMatch(html, /Não foi possível concluir o login/);
  assert.match(renderLightEntry({ css: '', loginError: true }), /<p class="entry-alert" role="alert">Não foi possível concluir o login\. Tente novamente\.<\/p>/);
});
