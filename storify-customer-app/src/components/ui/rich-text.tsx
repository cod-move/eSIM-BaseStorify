import { Parser } from 'htmlparser2';
import { useMemo } from 'react';
import { View } from 'react-native';

import { cn } from '@/lib/cn';

import { AppImage } from './app-image';
import { Text, type TextVariant } from './text';

/**
 * The merchant's formatted text, drawn natively.
 *
 * The store sends HTML written in a rich-text editor. It is never put in a web
 * view and never run. The text is read once by an HTML parser into a small
 * model of its own, and only what the model can hold is drawn: headings,
 * paragraphs, bold and italic, lists, links and pictures. Everything else is
 * left out when the model is built, so the drawing code has nothing else to
 * trip over:
 *
 * - elements that carry code or other pages (`script`, `style`, `iframe`,
 *   `object`, `svg`, forms …) are dropped with everything inside them;
 * - any other element the subset has no place for (`div`, `span`, `table` …)
 *   is unwrapped: its tags go, its text stays;
 * - attributes are never copied except the ones the subset uses: `href` on a
 *   link, `src`, `alt`, `width` and `height` on a picture. Event handlers and
 *   `style` never get that far;
 * - a link must go to a web address, a mail or phone address, or a path of the
 *   store's website; a picture must come from `http` or `https`.
 */

export type RichSpan = {
  text: string;
  bold: boolean;
  italic: boolean;
  /** A checked address, or `null` when the text is not a link. */
  href: string | null;
};

export type RichBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; spans: RichSpan[] }
  | { type: 'paragraph'; spans: RichSpan[] }
  | { type: 'list'; ordered: boolean; items: RichBlock[][] }
  | {
      type: 'image';
      src: string;
      alt: string | undefined;
      /** Width divided by height, when the HTML gives both. */
      aspectRatio: number | undefined;
    };

// ---------------------------------------------------------------------------
// Reading the HTML

type RawText = { text: string };
type RawElement = { tag: string; attrs: Record<string, string>; children: RawNode[] };
type RawNode = RawText | RawElement;

/** The attributes the subset reads. Nothing else is copied out of the HTML. */
const KEPT_ATTRIBUTES = ['href', 'src', 'alt', 'width', 'height'] as const;

/** Elements whose content is code, another page or something that is not text. */
const DROPPED = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'svg',
  'math',
  'canvas',
  'audio',
  'video',
  'source',
  'track',
  'picture',
  'map',
  'area',
  'form',
  'input',
  'button',
  'select',
  'option',
  'textarea',
  'head',
  'title',
  'meta',
  'link',
  'base',
  'hr',
  'dialog',
  'portal',
]);

/** Deeper than any real text is nested. What lies below is dropped. */
const MAX_DEPTH = 24;

function readTree(html: string): RawElement {
  const root: RawElement = { tag: '#root', attrs: {}, children: [] };
  const open: RawElement[] = [root];
  // Counts the elements being skipped. The parser closes every element it opens,
  // so skipping is over when the count is back at zero.
  let skipping = 0;

  const parser = new Parser({
    onopentag(name, attribs) {
      if (skipping > 0 || DROPPED.has(name) || open.length > MAX_DEPTH) {
        skipping += 1;
        return;
      }
      const attrs: Record<string, string> = {};
      for (const key of KEPT_ATTRIBUTES) {
        const value = attribs[key];
        if (typeof value === 'string') attrs[key] = value;
      }
      const element: RawElement = { tag: name, attrs, children: [] };
      open[open.length - 1]?.children.push(element);
      open.push(element);
    },
    ontext(data) {
      if (skipping > 0) return;
      const siblings = open[open.length - 1]?.children;
      const last = siblings?.[siblings.length - 1];
      // The parser hands over text in pieces (an entity is a piece of its own).
      if (last && 'text' in last) last.text += data;
      else siblings?.push({ text: data });
    },
    onclosetag() {
      if (skipping > 0) skipping -= 1;
      else if (open.length > 1) open.pop();
    },
  });
  parser.write(html);
  parser.end();
  return root;
}

// ---------------------------------------------------------------------------
// Addresses

/** Letters, digits and punctuation: no spaces, no control or invisible characters. */
const PLAIN_ADDRESS = /^[!-~¡-￿]+$/;
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
const LINK_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

function checkedAddress(value: string | undefined): string | null {
  const address = value?.trim();
  // A backslash is a slash to a browser (`/\evil.example`).
  if (!address || !PLAIN_ADDRESS.test(address) || address.includes('\\')) return null;
  return address;
}

/** `javascript:`, `data:` and the like come back as `null`, and the text stays plain. */
function linkAddress(value: string | undefined): string | null {
  const address = checkedAddress(value);
  if (!address) return null;
  const scheme = SCHEME.exec(address)?.[1];
  if (scheme) return LINK_SCHEMES.has(scheme.toLowerCase()) ? address : null;
  // `//host/path` names another site; every other path stays on the store's own.
  if (address.startsWith('//')) return null;
  // A colon in the first segment is a scheme that did not parse as one (`�javascript:`).
  return address.split(/[/?#]/)[0]?.includes(':') ? null : address;
}

function pictureAddress(value: string | undefined): string | null {
  const address = checkedAddress(value);
  if (!address) return null;
  if (address.startsWith('//')) return `https:${address}`;
  const scheme = SCHEME.exec(address)?.[1]?.toLowerCase();
  return scheme === 'http' || scheme === 'https' ? address : null;
}

function ratioOf(width: string | undefined, height: string | undefined): number | undefined {
  const NUMBER = /^\d+(\.\d+)?$/;
  if (!width || !height || !NUMBER.test(width) || !NUMBER.test(height)) return undefined;
  const ratio = Number(width) / Number(height);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : undefined;
}

// ---------------------------------------------------------------------------
// Building the model

type Style = { bold: boolean; italic: boolean; href: string | null };

const BOLD = new Set(['strong', 'b']);
const ITALIC = new Set(['em', 'i', 'cite', 'dfn']);
/** Unwrapped without a line break. Every element not listed here and not drawn ends the line. */
const INLINE = new Set([
  'span',
  'u',
  's',
  'strike',
  'del',
  'ins',
  'small',
  'big',
  'sub',
  'sup',
  'mark',
  'code',
  'kbd',
  'samp',
  'var',
  'abbr',
  'acronym',
  'font',
  'label',
  'time',
  'q',
  'tt',
  'bdi',
  'bdo',
  'wbr',
]);
const HEADING = /^h([1-6])$/;

function sameStyle(a: Style, b: Style): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.href === b.href;
}

/** What is left of the spans once the space at both ends is gone. */
function trimmed(spans: RichSpan[]): RichSpan[] {
  const result = spans.map((span) => ({ ...span }));
  while (result.length > 0) {
    const first = result[0];
    if (!first) break;
    first.text = first.text.replace(/^\s+/, '');
    if (first.text) break;
    result.shift();
  }
  while (result.length > 0) {
    const last = result[result.length - 1];
    if (!last) break;
    last.text = last.text.replace(/\s+$/, '');
    if (last.text) break;
    result.pop();
  }
  return result;
}

function convert(nodes: RawNode[], base: Style): RichBlock[] {
  const blocks: RichBlock[] = [];
  let spans: RichSpan[] = [];

  const endLine = () => {
    const line = trimmed(spans);
    if (line.length > 0) blocks.push({ type: 'paragraph', spans: line });
    spans = [];
  };

  const addText = (raw: string, style: Style) => {
    // HTML reads any run of spaces and line breaks as one space (a no-break space stays).
    let text = raw.replace(/[ \t\r\n\f]+/g, ' ');
    const last = spans[spans.length - 1];
    if (!last || last.text.endsWith(' ') || last.text.endsWith('\n')) text = text.replace(/^ /, '');
    if (!text) return;
    if (last && sameStyle(last, style)) last.text += text;
    else spans.push({ text, ...style });
  };

  const addBreak = (style: Style) => {
    const last = spans[spans.length - 1];
    if (last) last.text = last.text.replace(/ $/, '');
    if (last && sameStyle(last, style)) last.text += '\n';
    else spans.push({ text: '\n', ...style });
  };

  const visitAll = (children: RawNode[], style: Style) => {
    for (const child of children) visit(child, style);
  };

  const visit = (node: RawNode, style: Style) => {
    if ('text' in node) {
      addText(node.text, style);
      return;
    }
    const { tag, attrs, children } = node;

    if (tag === 'br') {
      addBreak(style);
    } else if (BOLD.has(tag)) {
      visitAll(children, { ...style, bold: true });
    } else if (ITALIC.has(tag)) {
      visitAll(children, { ...style, italic: true });
    } else if (tag === 'a') {
      visitAll(children, { ...style, href: linkAddress(attrs.href) ?? style.href });
    } else if (INLINE.has(tag)) {
      visitAll(children, style);
    } else if (tag === 'img') {
      endLine();
      const src = pictureAddress(attrs.src);
      if (src) {
        blocks.push({
          type: 'image',
          src,
          alt: attrs.alt?.trim() || undefined,
          aspectRatio: ratioOf(attrs.width, attrs.height),
        });
      }
    } else if (HEADING.test(tag)) {
      endLine();
      const level = Number(HEADING.exec(tag)?.[1]) as 1 | 2 | 3 | 4 | 5 | 6;
      // A heading is its text; a picture inside it stays a picture beside it.
      for (const inner of convert(children, style)) {
        blocks.push(
          inner.type === 'paragraph' ? { type: 'heading', level, spans: inner.spans } : inner
        );
      }
    } else if (tag === 'ul' || tag === 'ol') {
      endLine();
      const items: RichBlock[][] = [];
      for (const child of children) {
        // A list holds items. Whatever else the editor put there becomes an item too.
        const item = convert(
          'tag' in child && child.tag === 'li' ? child.children : [child],
          style
        );
        if (item.length > 0) items.push(item);
      }
      if (items.length > 0) blocks.push({ type: 'list', ordered: tag === 'ol', items });
    } else {
      // `p`, `div`, `li` outside a list, `table`, `blockquote` …: its text ends the line before and after.
      endLine();
      visitAll(children, style);
      endLine();
    }
  };

  visitAll(nodes, base);
  endLine();
  return blocks;
}

/**
 * The merchant's HTML as the blocks that will be drawn, and nothing else. The
 * model is the whole of what the screen can show: no HTML, no attribute and no
 * script of the original survives into it.
 */
export function parseRichText(html: string): RichBlock[] {
  return convert(readTree(html).children, { bold: false, italic: false, href: null });
}

// ---------------------------------------------------------------------------
// Drawing

/** A picture whose width and height the HTML does not give. */
const FALLBACK_ASPECT_RATIO = 4 / 3;

type SpansProps = {
  variant: TextVariant;
  spans: RichSpan[];
  onLinkPress: ((href: string) => void) | undefined;
  className?: string;
  role?: 'heading';
};

function Spans({ variant, spans, onLinkPress, className, role }: SpansProps) {
  return (
    <Text variant={variant} className={className} role={role}>
      {spans.map((span, index) => {
        const link = onLinkPress ? span.href : null;
        if (!span.bold && !span.italic && !link) return span.text;
        return (
          // The same variant, so that a bold word does not change the line's height.
          <Text
            key={index}
            variant={variant}
            className={cn(
              span.bold && 'font-bold',
              span.italic && 'italic',
              link && 'text-link underline'
            )}
            role={link ? 'link' : undefined}
            onPress={link ? () => onLinkPress?.(link) : undefined}>
            {span.text}
          </Text>
        );
      })}
    </Text>
  );
}

type BlockViewProps = { block: RichBlock; onLinkPress: ((href: string) => void) | undefined };

function BlockView({ block, onLinkPress }: BlockViewProps) {
  switch (block.type) {
    case 'heading':
      return (
        <Spans
          variant={block.level <= 2 ? 'heading' : 'subheading'}
          spans={block.spans}
          onLinkPress={onLinkPress}
          className="mt-2"
          role="heading"
        />
      );
    case 'paragraph':
      return <Spans variant="long" spans={block.spans} onLinkPress={onLinkPress} />;
    case 'list':
      return (
        <View className="gap-2">
          {block.items.map((item, index) => (
            <View key={index} className="flex-row gap-2">
              {/* A bullet says nothing a screen reader needs; a number does. */}
              <Text
                variant="long"
                className="min-w-5 text-center"
                accessible={block.ordered}
                importantForAccessibility={block.ordered ? 'auto' : 'no'}>
                {block.ordered ? `${index + 1}.` : '•'}
              </Text>
              <View className="flex-1 gap-2">
                {item.map((inner, innerIndex) => (
                  <BlockView key={innerIndex} block={inner} onLinkPress={onLinkPress} />
                ))}
              </View>
            </View>
          ))}
        </View>
      );
    case 'image':
      return (
        <AppImage
          image={{ thumb: block.src, card: block.src, full: block.src, alt: block.alt }}
          size="full"
          className="w-full rounded-lg"
          aspectRatio={block.aspectRatio ?? FALLBACK_ASPECT_RATIO}
          contentFit="contain"
          decorative={!block.alt}
        />
      );
  }
}

type RichTextProps = {
  /** The merchant's HTML, as the API sends it. */
  html: string;
  /**
   * What happens when a link is tapped, with the address as written in the
   * HTML (a web address or a path of the store's website). Without it, links
   * are drawn as plain text.
   */
  onLinkPress?: (href: string) => void;
  className?: string;
};

/** The merchant's HTML, drawn with the app's own text styles. */
export function RichText({ html, onLinkPress, className }: RichTextProps) {
  const blocks = useMemo(() => parseRichText(html), [html]);

  return (
    <View className={cn('gap-4', className)}>
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} onLinkPress={onLinkPress} />
      ))}
    </View>
  );
}
