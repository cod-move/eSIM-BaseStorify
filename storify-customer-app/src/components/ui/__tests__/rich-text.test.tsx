import { fireEvent, render, screen } from '@testing-library/react-native';

import { parseRichText, RichText, type RichBlock, type RichSpan } from '../rich-text';

const text = (spans: RichSpan[]) => spans.map((span) => span.text).join('');

/** Every block and span of a model, however deeply nested. */
function walk(blocks: RichBlock[]): { blocks: RichBlock[]; spans: RichSpan[] } {
  const found = { blocks: [] as RichBlock[], spans: [] as RichSpan[] };
  const visit = (list: RichBlock[]) => {
    for (const block of list) {
      found.blocks.push(block);
      if (block.type === 'list') block.items.forEach(visit);
      else if (block.type !== 'image') found.spans.push(...block.spans);
    }
  };
  visit(blocks);
  return found;
}

/** All the text the model would put on the screen. */
const allText = (blocks: RichBlock[]) =>
  walk(blocks)
    .spans.map((span) => span.text)
    .join('|');

const SUBSET = new Set(['heading', 'paragraph', 'list', 'image']);
const SAFE_LINK = /^(https?:\/\/|mailto:|tel:|\/(?!\/)|[^:/\s]+(\/|$))/i;

/** What nothing may leave behind, whatever the input was. */
function expectInsideTheSubset(blocks: RichBlock[]) {
  const { blocks: all, spans } = walk(blocks);
  for (const block of all) {
    expect(SUBSET.has(block.type)).toBe(true);
    if (block.type === 'image') {
      expect(Object.keys(block).sort()).toEqual(['alt', 'aspectRatio', 'src', 'type']);
      expect(block.src).toMatch(/^https?:\/\/\S+$/i);
    }
    if (block.type === 'heading') expect([1, 2, 3, 4, 5, 6]).toContain(block.level);
  }
  for (const span of spans) {
    expect(Object.keys(span).sort()).toEqual(['bold', 'href', 'italic', 'text']);
    expect(span.text).not.toMatch(/globalThis|alert\(|@import|srcdoc/);
    if (span.href !== null) expect(span.href).toMatch(SAFE_LINK);
    expect(span.href ?? '').not.toMatch(/^\s*(javascript|data|vbscript|file|blob):/i);
  }
}

describe('parseRichText: the subset', () => {
  it('reads headings, paragraphs, bold, italic, lists, links and pictures', () => {
    const blocks = parseRichText(
      '<h2>Features</h2><p>Plain <strong>bold</strong> and <em>italic</em>, <a href="/products/x">a link</a>.</p>' +
        '<ul><li>One</li><li>Two</li></ul><ol><li>First</li></ol>' +
        '<img src="https://cdn.example.com/a.jpg" alt="A phone" width="800" height="400">'
    );

    expect(blocks.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'list',
      'list',
      'image',
    ]);
    expect(blocks[0]).toMatchObject({ level: 2, spans: [{ text: 'Features' }] });
    expect(blocks[1]).toMatchObject({
      spans: [
        { text: 'Plain ', bold: false },
        { text: 'bold', bold: true },
        { text: ' and ', bold: false },
        { text: 'italic', italic: true },
        { text: ', ', italic: false },
        { text: 'a link', href: '/products/x' },
        { text: '.', href: null },
      ],
    });
    expect(blocks[2]).toMatchObject({ ordered: false });
    expect(blocks[3]).toMatchObject({ ordered: true });
    expect(blocks[4]).toEqual({
      type: 'image',
      src: 'https://cdn.example.com/a.jpg',
      alt: 'A phone',
      aspectRatio: 2,
    });
  });

  it('reads nested lists and a paragraph inside an item', () => {
    const [list] = parseRichText('<ul><li><p>Outer</p><ul><li>Inner</li></ul></li></ul>');

    expect(list).toMatchObject({
      type: 'list',
      items: [[{ type: 'paragraph' }, { type: 'list', items: [[{ type: 'paragraph' }]] }]],
    });
  });

  it('collapses the editor’s white space and drops empty paragraphs', () => {
    const blocks = parseRichText(
      '<p>  a \n   <b> b </b>\n c  </p><p>&nbsp;</p><p> </p><p><br></p>\n\n<p>d&amp;e</p>'
    );

    expect(blocks.map((block) => block.type === 'paragraph' && text(block.spans))).toEqual([
      'a b c',
      'd&e',
    ]);
  });

  it('keeps a line break inside a paragraph', () => {
    const [paragraph] = parseRichText('<p>one <br> two</p>');

    expect(paragraph).toMatchObject({ spans: [{ text: 'one\ntwo' }] });
  });

  it('keeps the text of elements it has no place for, on lines of their own', () => {
    const blocks = parseRichText(
      '<div>First<span> and more</span></div><table><tr><td>Cell</td></tr></table><blockquote>Quote</blockquote>'
    );

    expect(blocks.map((block) => block.type === 'paragraph' && text(block.spans))).toEqual([
      'First and more',
      'Cell',
      'Quote',
    ]);
  });

  it('puts a heading’s picture beside it and keeps text that was never in a tag', () => {
    const blocks = parseRichText(
      'Loose text<h3>Title<img src="https://cdn.example.com/i.png"></h3>'
    );

    expect(blocks.map((block) => block.type)).toEqual(['paragraph', 'heading', 'image']);
  });

  it('reads an empty or broken input as nothing, and never throws', () => {
    expect(parseRichText('')).toEqual([]);
    expect(parseRichText('   ')).toEqual([]);
    expect(() => parseRichText('<p><b><i>unclosed <ul><li>x</p></b></ol></div><')).not.toThrow();
    expect(parseRichText('<p><b><i>unclosed')).toMatchObject([
      { type: 'paragraph', spans: [{ text: 'unclosed', bold: true, italic: true }] },
    ]);
  });

  it('stops at a depth no real text reaches', () => {
    const deep = `${'<div>'.repeat(200)}deep text${'</div>'.repeat(200)}<p>after</p>`;

    expect(allText(parseRichText(deep))).toBe('after');
  });
});

describe('parseRichText: hostile HTML', () => {
  it('drops scripts and styles with their code', () => {
    const blocks = parseRichText(
      '<p>Before</p><script>globalThis.__pwned = 1; alert("x")</script><style>p { color: red }</style>' +
        '<noscript><p>noscript text</p></noscript><p>After</p>'
    );

    expect(allText(blocks)).toBe('Before|After');
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
    expectInsideTheSubset(blocks);
  });

  it('drops frames, objects, vector graphics, forms and media with everything inside', () => {
    const blocks = parseRichText(
      [
        '<iframe src="https://evil.example"><p>frame text</p></iframe>',
        '<object data="x.swf"><p>object text</p></object>',
        '<embed src="x.swf">',
        '<svg><script>alert(1)</script><text>svg text</text><a href="javascript:alert(1)">svg link</a></svg>',
        '<math><mi>math text</mi></math>',
        '<form action="https://evil.example"><input name="card"><button>Pay</button><textarea>t</textarea></form>',
        '<video src="v.mp4"><source src="v.mp4">video text</video>',
        '<template><p>template text</p></template>',
        '<p>kept</p>',
      ].join('')
    );

    expect(allText(blocks)).toBe('kept');
    expectInsideTheSubset(blocks);
  });

  it('shows markup that is only text as text, never as elements', () => {
    const blocks = parseRichText(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt; and &lt;b&gt;x&lt;/b&gt;</p>'
    );

    expect(allText(blocks)).toBe('<script>alert(1)</script> and <b>x</b>');
    expect(walk(blocks).blocks).toHaveLength(1);
  });

  it('does not carry event handlers, styles, classes or ids into the model', () => {
    const blocks = parseRichText(
      '<p onclick="globalThis.__pwned=1" style="position:fixed" class="x" id="y">Hi</p>' +
        '<img src="https://cdn.example.com/a.png" onerror="globalThis.__pwned=1" onload="x()" style="width:9999px">' +
        '<a href="/cart" onmouseover="x()" target="_blank" rel="x">go</a>'
    );

    expect(JSON.stringify(blocks)).not.toMatch(
      /onclick|onerror|onload|onmouseover|position|class|target/
    );
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
    expectInsideTheSubset(blocks);
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    '  javascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    '\u0001javascript:alert(1)',
    '\u0000javascript:alert(1)',
    '&#106;avascript:alert(1)',
    '&#x6A;avascript:alert(1)',
    'jav&#x09;ascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'blob:https://x.example/uuid',
    'intent://scan/#Intent;scheme=zxing;end',
    'storify-evil://x',
    '//evil.example/path',
    '/\\evil.example',
    '\\\\evil.example',
    'https://exa mple.com',
    '',
  ])('turns the link %j into plain text', (href) => {
    const attribute = href.includes('"') ? `'${href}'` : `"${href}"`;
    const blocks = parseRichText(`<p><a href=${attribute}>click</a></p>`);

    expect(walk(blocks).spans).toEqual([{ text: 'click', bold: false, italic: false, href: null }]);
    expectInsideTheSubset(blocks);
  });

  it.each([
    ['https://shop.example.com/products/x?a=1#top', 'https://shop.example.com/products/x?a=1#top'],
    ['HTTP://shop.example.com', 'HTTP://shop.example.com'],
    ['/products/red-shoe', '/products/red-shoe'],
    ['/bn/products/বাংলা', '/bn/products/বাংলা'],
    ['products/red-shoe', 'products/red-shoe'],
    ['mailto:help@example.com', 'mailto:help@example.com'],
    ['tel:+8801700000000', 'tel:+8801700000000'],
    ['  /cart  ', '/cart'],
    ['/a?x=1&amp;y=2', '/a?x=1&y=2'],
  ])('keeps the link %j', (href, kept) => {
    const [paragraph] = parseRichText(`<p><a href="${href}">go</a></p>`);

    expect(paragraph).toMatchObject({ spans: [{ text: 'go', href: kept }] });
  });

  it.each([
    'javascript:alert(1)',
    'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+',
    'data:image/png;base64,iVBORw0KGgo=',
    'file:///etc/passwd',
    'blob:https://x.example/uuid',
    '/uploads/relative.png',
    'relative.png',
    'ftp://x.example/a.png',
    '\u0001https://x.example/a.png',
    'https://x.example/a b.png',
    '',
  ])('leaves out the picture %j', (src) => {
    expect(parseRichText(`<p>text</p><img src="${src}" alt="x">`)).toHaveLength(1);
  });

  it('keeps a picture from http, https and a protocol-relative address', () => {
    const sources = parseRichText(
      '<img src="http://a.example/1.png"><img src="https://a.example/2.png"><img src="//a.example/3.png">'
    ).map((block) => block.type === 'image' && block.src);

    expect(sources).toEqual([
      'http://a.example/1.png',
      'https://a.example/2.png',
      'https://a.example/3.png',
    ]);
  });

  it('takes a picture’s proportions only from plain numbers', () => {
    const ratio = (attributes: string) => {
      const [image] = parseRichText(`<img src="https://a.example/i.png" ${attributes}>`);
      return image?.type === 'image' ? image.aspectRatio : 'no image';
    };

    expect(ratio('width="300" height="200"')).toBe(1.5);
    expect(ratio('width="100%" height="200"')).toBeUndefined();
    expect(ratio('width="300"')).toBeUndefined();
    expect(ratio('width="0" height="0"')).toBeUndefined();
    expect(ratio('width="1e9" height="x"')).toBeUndefined();
    expect(ratio('width="300" height="0"')).toBeUndefined();
  });

  it('finds nothing outside the subset in a pile of hostile fragments, in any order', () => {
    const fragments = [
      '<script>globalThis.__pwned=1</script>',
      '<img src=x onerror=globalThis.__pwned=1>',
      '<a href="javascript:globalThis.__pwned=1">x</a>',
      '<svg onload="globalThis.__pwned=1"><circle/></svg>',
      '<iframe srcdoc="<script>1</script>">',
      '<p onclick=1>p',
      '</p></b></div></li>',
      '<ul><li>',
      '<h1>',
      '<style>@import "x"</style>',
      '<!-- <script>x</script> -->',
      '<![CDATA[ <script>x</script> ]]>',
      '<?php echo 1 ?>',
      '<a href="https://ok.example">ok</a>',
      '<img src="https://ok.example/a.png">',
      '<b>',
      '<div>',
      '&lt;&amp;&#0;&#x110000;',
      '<noscript></noscript></noscript>',
      '<textarea><b>x</textarea>',
      '<title><p>x</title>',
      '<<script>>',
      '<a href="//evil.example">',
      '<object><param name=x value=y></object>',
      '<math><mtext><script>1</script></mtext></math>',
    ];
    // A fixed pseudo-random order, so a failure can be repeated.
    let seed = 20241002;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

    for (let round = 0; round < 300; round++) {
      let html = '';
      for (let part = 0; part < 4 + Math.floor(next() * 8); part++) {
        html += fragments[Math.floor(next() * fragments.length)] ?? '';
      }
      expectInsideTheSubset(parseRichText(html));
    }
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
  });
});

describe('RichText', () => {
  const HTML =
    '<h2>Features</h2><p>Plain <strong>bold</strong> <a href="/products/x">a link</a></p>' +
    '<ul><li>One</li><li>Two</li></ul><ol><li>First</li></ol>' +
    '<img src="https://cdn.example.com/a.jpg" alt="A phone"><script>alert("x")</script>';

  it('draws the text, the headings and the list items', async () => {
    await render(<RichText html={HTML} />);

    expect(screen.getByText('Features')).toBeOnTheScreen();
    expect(screen.getByText('bold')).toBeOnTheScreen();
    expect(screen.getByText('One')).toBeOnTheScreen();
    expect(screen.getByText('Two')).toBeOnTheScreen();
    expect(screen.getByText('1.')).toBeOnTheScreen();
    expect(screen.getByText('First')).toBeOnTheScreen();
    expect(screen.getByRole('heading', { name: 'Features' })).toBeOnTheScreen();
    expect(screen.queryByText(/alert/)).toBeNull();
  });

  it('draws a picture with its description', async () => {
    await render(<RichText html={HTML} />);

    expect(screen.getByLabelText('A phone')).toBeOnTheScreen();
  });

  it('opens a link through the handler, with the address as written', async () => {
    const onLinkPress = jest.fn();
    await render(<RichText html={HTML} onLinkPress={onLinkPress} />);

    await fireEvent.press(screen.getByRole('link', { name: 'a link' }));

    expect(onLinkPress).toHaveBeenCalledWith('/products/x');
  });

  it('draws a link as plain text when nothing handles it', async () => {
    await render(<RichText html={HTML} />);

    expect(screen.getByText(/a link/)).toBeOnTheScreen();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('draws nothing for hostile HTML that holds no text', async () => {
    await render(
      <RichText html={'<script>alert(1)</script><iframe src="https://evil.example"></iframe>'} />
    );

    expect(screen.queryByText(/alert/)).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
