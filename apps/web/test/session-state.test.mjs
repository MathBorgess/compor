import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSessionState } from '../lib/session-state.ts';

test('sessão valida strings sem antecipar a decisão de autenticação do workspace', () => {
  for (const value of [
    { state: 'connected', userId: 'alice' },
    { state: 'connected', userId: '' },
    { state: 'connected' },
    { state: 'signed-out' },
    { state: 'unavailable' },
    { state: 'unrecognized' },
    { state: '' },
    { state: 'signed-out', userId: undefined },
  ]) assert.deepEqual(parseSessionState(value), value);
});

test('sessão rejeita payloads sem objeto, estado string ou identificador opcional string', () => {
  for (const value of [
    undefined, null, true, 1, 'connected', [],
    [{ state: 'connected', userId: 'alice' }],
    {}, { state: undefined }, { state: null }, { state: 1 },
    { state: ['connected'] }, { state: {} },
    { state: 'connected', userId: null },
    { state: 'connected', userId: 1 },
    { state: 'connected', userId: [] },
    { state: 'connected', userId: {} },
  ]) assert.throws(() => parseSessionState(value), /invalid_session/);
});

test('sessão retorna apenas os campos validados em um objeto independente', () => {
  const input = { state: 'connected', userId: 'alice', role: 'admin', extra: { private: true } };
  const result = parseSessionState(input);
  assert.deepEqual(result, { state: 'connected', userId: 'alice' });
  assert.notEqual(result, input);
  input.userId = 'bob';
  assert.equal(result.userId, 'alice');
});
