/** All groups retain both reserved cases. Development cases keep their fixed order. */
export function selectCases(cases, args = []) {
  const count = args.length === 0 ? 5 : Number(args[1]);
  if (args.length && (args.length !== 2 || args[0] !== '--count' || !['3','4','5'].includes(args[1]))) {
    throw Error('Use --count 3, --count 4 or --count 5.');
  }
  if (cases.length !== 5) throw Error('Expected three development and two reserved cases.');
  return [...cases.slice(0, count - 2), ...cases.slice(3)];
}
