export const POST_FORMATS = /*#__PURE__*/Object.freeze(['single', 'carousel', 'collection', 'story']);

export const FORMAT_FRAME_LIMITS = /*#__PURE__*/Object.freeze({
  single: /*#__PURE__*/Object.freeze({ minFrames: 1, maxFrames: 1, defaultFrames: 1, multiFrame: false }),
  carousel: /*#__PURE__*/Object.freeze({ minFrames: 3, maxFrames: 10, defaultFrames: 5, multiFrame: true }),
  collection: /*#__PURE__*/Object.freeze({ minFrames: 2, maxFrames: 10, defaultFrames: 3, multiFrame: true }),
  story: /*#__PURE__*/Object.freeze({ minFrames: 1, maxFrames: 1, defaultFrames: 1, multiFrame: false }),
});

export function isPostFormat(value) {
  return typeof value === 'string' && POST_FORMATS.includes(value);
}

export function normalizePostFormat(value) {
  return isPostFormat(value) ? value : 'single';
}
