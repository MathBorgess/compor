const REVIEW_TIMEOUT_MS = 15_000;
const findingCodes = new Set(['visual_integrity', 'required_text', 'factual_fidelity', 'generic_direction']);

function validEvidence(value, limit) {
  return typeof value === 'string' && value.length <= limit && value.trim().length > 0 && value.isWellFormed();
}

function validFinding(finding) {
  return finding && Object.keys(finding).sort().join(',') === 'code,evidence,region' &&
    findingCodes.has(finding.code) && validEvidence(finding.region, 120) && validEvidence(finding.evidence, 600);
}

function readDecision(result) {
  if (!result || Object.keys(result).sort().join(',') !== 'decision,findings') return 'unsure';
  const { decision, findings } = result;
  if (!Array.isArray(findings) || findings.length > 8 || !Array.from(findings).every(validFinding)) return 'unsure';
  if (decision === 'approve' && findings.length === 0) return 'approve';
  if (decision === 'reject' && findings.length > 0) return 'reject';
  return 'unsure';
}

export async function reviewImageCandidate(review, candidate, requestSignal, authorizeReview) {
  const deadline = new AbortController();
  const signal = AbortSignal.any([deadline.signal, requestSignal]);
  if (signal.aborted) return 'unsure';

  const timeout = setTimeout(() => deadline.abort(), REVIEW_TIMEOUT_MS);
  let abort;
  try {
    const canceled = new Promise(resolve => {
      abort = () => resolve('unsure');
      signal.addEventListener('abort', abort, { once: true });
    });
    const authorized = async () => !signal.aborted
      && (!authorizeReview || await authorizeReview() === true) && !signal.aborted;
    const judge = async () => {
      if (!await authorized()) return 'unsure';
      const decision = readDecision(await review({ ...candidate, signal }));
      if (decision === 'approve' && !await authorized()) return 'unsure';
      return signal.aborted ? 'unsure' : decision;
    };
    return await Promise.race([canceled, judge()]);
  } catch {
    return 'unsure';
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}
