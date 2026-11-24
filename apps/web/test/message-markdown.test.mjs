import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MessageMarkdown from '../studio/message-markdown.tsx';

test('MessageMarkdown renderiza blocos e inline seguros e neutraliza HTML bruto, imagens externas e esquemas inválidos', () => {
  const input = [
    '# Título principal',
    '',
    '**Direção visual** com *ênfase* e `código`.',
    '',
    '- Azul',
    '- Amarelo',
    '',
    '1. Passo um',
    '2. Passo dois',
    '',
    '```',
    'const x = "<script>";',
    '```',
    '',
    '[Link seguro](https://example.com/) [Contato](mailto:contato@example.com) [Link perigoso](javascript:alert(1)) [Link relativo](/privado) [Link em arquivo](file:///etc/passwd)',
    '',
    '![imagem externa](https://tracking.example/pixel.png)',
    '',
    '<script>alert(1)</script>',
    '',
    '<img src="https://tracking.example/raw.png" onerror="alert(1)">',
    '',
    '<a href="javascript:alert(1)">HTML bruto</a>',
  ].join('\n');

  const html = renderToStaticMarkup(createElement(MessageMarkdown, { text: input }));
  assert.match(html, /<h1>Título principal<\/h1>/);
  assert.match(html, /<strong>Direção visual<\/strong>/);
  assert.match(html, /<em>ênfase<\/em>/);
  assert.match(html, /<code>código<\/code>/);
  assert.match(html, /<ul><li>Azul<\/li><li>Amarelo<\/li><\/ul>/);
  assert.match(html, /<ol><li>Passo um<\/li><li>Passo dois<\/li><\/ol>/);
  assert.match(html, /<pre><code>const x = &quot;&lt;script&gt;&quot;;<\/code><\/pre>/);
  assert.match(html, /<a href="https:\/\/example\.com\/" target="_blank" rel="noopener noreferrer">Link seguro<\/a>/);
  assert.match(html, /<a href="mailto:contato@example\.com" target="_blank" rel="noopener noreferrer">Contato<\/a>/);
  assert.match(html, /<span>imagem externa<\/span>/);
  assert.equal(html.includes('href="javascript:'), false);
  assert.equal(html.includes('<script'), false);
  assert.equal(html.includes('<img'), false);
  assert.equal(html.includes('href="/privado"'), false);
  assert.equal(html.includes('href="file:'), false);
  assert.equal(html.includes('src="https://tracking.example'), false);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;a href=&quot;javascript:alert\(1\)&quot;&gt;HTML bruto&lt;\/a&gt;/);
});

test('MessageMarkdown avança normalmente diante de títulos vazios, listas vazias e blocos de código sem fechamento', () => {
  const edgeCases = [
    '# ',
    '##\t',
    '###   ',
    '- ',
    '1. ',
    'Parágrafo após cabeçalhos vazios.',
    '```',
    'linha sem fechamento',
  ].join('\n');

  const html = renderToStaticMarkup(createElement(MessageMarkdown, { text: edgeCases }));
  assert.match(html, /<p># <br\/>##\t<br\/>###   <\/p>/);
  assert.match(html, /Parágrafo após cabeçalhos vazios\./);
  assert.match(html, /<pre><code>linha sem fechamento<\/code><\/pre>/);
});
