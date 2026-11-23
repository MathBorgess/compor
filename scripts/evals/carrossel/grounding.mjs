const claimSlot = /^(?:headline|body|figure|alt|kicker|source|listItems\.[0-6]|diagram\.(?:sample|labels\.[0-2]|items\.[0-2])|caption)$/;
const resultNumber = /(?:R\$\s*\d[\d.,]*|\d[\d.,]*\s*(?:%|por cento|vezes\b|[×x](?!\s*\d|[\p{L}])|reais\b)|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b)/giu;
const personalResult = /\b(?:eu\s+)?(?:alcancei|aumentei|bati|cresci|dobrei|faturei|ganhei|reduzi|tripliquei|vendi)\s+(?:\S+\s+){0,5}\d[\d.,]*/giu;

export function numberedFacts(facts) {
  return Array.isArray(facts) ? facts.map((text, index) => ({ id: `f${index + 1}`, text })) : [];
}

function normalize(value) {
  return value.normalize('NFKC').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();
}

function numericTokens(text) {
  return new Set(Array.from(text.matchAll(/\d[\d.,]*/gu), item => item[0].replace(/[.,]+$/u, '')));
}

function canonicalMeasuredClaim(value) {
  return normalize(value).replace(/por cento/g, '%')
    .replace(/r\$\s*/g, '').replace(/\s*reais$/g, 'currency').replace(/\s*(?:vezes|[×x])$/g, 'times')
    .replace(/\s+/g, '');
}

function quantitativeAnchor(value) {
  const normalized = canonicalMeasuredClaim(value);
  return /^R\$/i.test(value) ? normalized + 'currency' : normalized;
}

function resultMarkers(text) {
  return [...text.matchAll(resultNumber), ...text.matchAll(personalResult)]
    .map(match => ({ quote: match[0], index: match.index }));
}

function addString(slots, slideId, slot, text) {
  if (typeof text === 'string' && text.trim()) slots.set(`${slideId}:${slot}`, text);
}

function deckSlots(deck) {
  const slots = new Map();
  for (const slide of deck.slides) {
    for (const slot of ['headline', 'kicker', 'body', 'figure', 'alt', 'source']) addString(slots, slide.id, slot, slide[slot]);
    if (Array.isArray(slide.listItems)) slide.listItems.forEach((text, index) => addString(slots, slide.id, `listItems.${index}`, text));
    if (slide.diagram && typeof slide.diagram === 'object') {
      addString(slots, slide.id, 'diagram.sample', slide.diagram.sample);
      for (const key of ['labels', 'items']) {
        if (Array.isArray(slide.diagram[key])) slide.diagram[key].forEach((text, index) => addString(slots, slide.id, `diagram.${key}.${index}`, text));
      }
    }
  }
  addString(slots, 'deck', 'caption', deck.caption);
  return slots;
}

function claimAnchor(entry, slots, known) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const { slideId, slot, quote, factId } = entry;
  if (typeof slideId !== 'string' || typeof slot !== 'string' || !claimSlot.test(slot) ||
      typeof quote !== 'string' || quote.length > 500 || !quote.trim() || !known.has(factId)) return null;
  const key = `${slideId}:${slot}`;
  const text = slots.get(key);
  const source = known.get(factId);
  if (!text || typeof source !== 'string' || !text.includes(quote)) return null;
  const sourceNumbers = numericTokens(source);
  const sourceMeasuredClaims = new Set(Array.from(source.matchAll(resultNumber), match => quantitativeAnchor(match[0])));
  if ([...numericTokens(quote)].some(number => !sourceNumbers.has(number)) ||
    Array.from(quote.matchAll(resultNumber), match => quantitativeAnchor(match[0])).some(marker => !sourceMeasuredClaims.has(marker))) {
    return null;
  }
  return { key, quote, factId };
}

export function inspectClaimLedger(deck, claims, facts) {
  if (!deck || !Array.isArray(deck.slides) || deck.slides.some(slide => !slide || typeof slide !== 'object') || !Array.isArray(claims) || claims.length > 50) {
    return { status: 'fail', issues: [{ id: 'CLAIM_LEDGER', detail: 'Informe uma lista de afirmações verificáveis.' }], anchors: [] };
  }
  const slots = deckSlots(deck);
  const known = new Map(numberedFacts(facts).map(fact => [fact.id, fact.text]));
  const anchors = [];
  const used = new Set();
  const issues = [];
  for (const [index, entry] of claims.entries()) {
    const anchor = claimAnchor(entry, slots, known);
    if (!anchor) {
      issues.push({ id: 'CLAIM_ANCHOR', index: index + 1, detail: 'A citação, o slot ou o fato não corresponde ao plano e ao briefing.' });
      continue;
    }
    const identity = JSON.stringify([anchor.key, normalize(anchor.quote), anchor.factId]);
    if (!used.has(identity)) anchors.push(anchor);
    used.add(identity);
  }
  for (const [slot, text] of slots) {
    for (const marker of resultMarkers(text)) {
      // Match the occurrence, so a cited “47%” elsewhere cannot cover other slots.
      const covered = anchors.some(anchor => anchor.key === slot && anchor.quote.includes(marker.quote) &&
        [...text.matchAll(new RegExp(anchor.quote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gu'))]
          .some(match => match.index <= marker.index && match.index + match[0].length >= marker.index + marker.quote.length));
      if (!covered) issues.push({ id: 'UNBOUND_RESULT', slot, detail: marker.quote });
    }
  }
  return { status: issues.length ? 'fail' : 'pass', issues, anchors };
}
