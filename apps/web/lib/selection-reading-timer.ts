/** Product time; callers still check scope, consent and eligibility on dispatch. */
export const SELECTION_READING_DELAY_MS = 5_000;

export interface SelectionReadingClock {
  schedule(callback: () => void, delayMs: number): () => void;
}

const browserClock: SelectionReadingClock = {
  schedule(callback, delayMs) {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  },
};

export function scheduleSelectionReading(
  callback: () => void,
  clock: SelectionReadingClock = browserClock,
): () => void {
  return clock.schedule(callback, SELECTION_READING_DELAY_MS);
}
