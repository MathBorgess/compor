export interface SessionState {
  state: string;
  userId?: string;
}

export function parseSessionState(input: unknown): SessionState {
  if (
    typeof input !== 'object' ||
    input === null ||
    Array.isArray(input) ||
    !('state' in input) ||
    typeof input.state !== 'string'
  ) throw Error('invalid_session');

  if ('userId' in input) {
    if (input.userId !== undefined && typeof input.userId !== 'string')
      throw Error('invalid_session');
    return { state: input.state, userId: input.userId };
  }
  return { state: input.state };
}
