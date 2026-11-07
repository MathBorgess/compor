export interface SessionState {
  state: string;
  userId?: string;
  account?: { label: string; local: boolean };
}

export function parseSessionState(input: unknown): SessionState {
  if (
    typeof input !== 'object' ||
    input === null ||
    Array.isArray(input) ||
    !('state' in input) ||
    typeof input.state !== 'string'
  ) throw Error('invalid_session');

  let account:SessionState['account'];
  if ('account' in input) {
    if (typeof input.account !== 'object' || input.account === null || Array.isArray(input.account) ||
        !('label' in input.account) || typeof input.account.label !== 'string' ||
        !input.account.label.trim() || input.account.label.length > 120 || /[\u0000-\u001f\u007f]/.test(input.account.label) ||
        !('local' in input.account) || typeof input.account.local !== 'boolean') throw Error('invalid_session');
    account={label:input.account.label,local:input.account.local};
  }
  if ('userId' in input) {
    if (input.userId !== undefined && typeof input.userId !== 'string')
      throw Error('invalid_session');
    return { state: input.state, userId: input.userId, ...(account?{account}:{}) };
  }
  return { state: input.state, ...(account?{account}:{}) };
}
