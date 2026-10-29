import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSourcesCatalog } from '../dist/catalog/catalog.js';
import { selectCuratedBoardsForQuery } from '../dist/providers/curated_pinterest.js';

test('termos comuns com ad interno não são interpretados como anúncio', async () => {
  const catalog = await loadSourcesCatalog();
  const source = catalog.sources.find((item) => item.source_id === 'pinterest_curated_design');
  const allowed = ['behance/advertising', 'behance/graphic-design'];
  assert.ok(allowed.every((slug) => source.allowed_boards_or_queries.includes(slug)));
  const query = {
    briefing_summary: 'Uma peça de alta qualidade',
    target_format: 'instagram_post',
    aspect_focus: [],
    source: { ...source, allowed_boards_or_queries: allowed },
  };
  assert.equal(selectCuratedBoardsForQuery(query)[0], 'behance/graphic-design');
  for (const briefing of ['Um ad', 'Novos ads']) {
    assert.equal(selectCuratedBoardsForQuery({ ...query, briefing_summary: briefing })[0], 'behance/advertising');
  }

  // Mesmo quando a categoria de campanha é correta, "qualidade" não deve
  // adicionar um falso ponto de palavra-chave para o board de anúncios.
  assert.ok(source.allowed_boards_or_queries.includes('weandthecolor/feed'));
  assert.equal(selectCuratedBoardsForQuery({
    ...query,
    briefing_summary: 'campanha e identidade com qualidade',
    source: { ...source, allowed_boards_or_queries: ['weandthecolor/feed', 'behance/advertising'] },
  })[0], 'weandthecolor/feed');
});
