// Provider call IDs are opaque. This application accepts the observed call_
// and exec_ families with the existing 128-character suffix bound (133 total).
// This shape check is not authorization: retain exact provider equality and
// the signed actor/project/session/turn binding. Never normalize the value.
export function isAgentCallId(value){
 return typeof value==='string'&&/^(?:call|exec)_[A-Za-z0-9_-]{1,128}$/.test(value)&&!/\s/.test(value)&&!/sk-/i.test(value);
}
