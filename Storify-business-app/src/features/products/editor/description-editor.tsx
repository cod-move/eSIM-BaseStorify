'use dom';

import { Image } from '@tiptap/extension-image';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import type { DOMProps } from 'expo/dom';
import { useEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * The product description's visual editor: TipTap, as the web dashboard's, so
 * both write the same HTML. It runs in a web view (an Expo DOM component); the
 * native side gives it the words, the colours and the starting HTML, and hears
 * back each change, its focus and its height.
 */

export type DescriptionTool =
  | 'undo'
  | 'redo'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'paragraph'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'bulletList'
  | 'orderedList'
  | 'blockquote'
  | 'link'
  | 'rule'
  | 'clear';

export type DescriptionEditorLabels = Record<DescriptionTool, string> & {
  toolbar: string;
  editor: string;
  linkUrl: string;
  applyLink: string;
  removeLink: string;
  cancelLink: string;
};

/** The theme's token values, read on the native side (`useCSSVariable`). */
export type DescriptionEditorColors = {
  foreground: string;
  muted: string;
  field: string;
  border: string;
  link: string;
  selected: string;
  selectedForeground: string;
};

type Props = {
  initialHtml: string;
  editable: boolean;
  placeholder: string;
  labels: DescriptionEditorLabels;
  colors: DescriptionEditorColors;
  fontScale: number;
  direction: 'ltr' | 'rtl';
  onChange: (html: string) => Promise<void>;
  onFocusChange: (focused: boolean) => Promise<void>;
  onHeight: (height: number) => Promise<void>;
  dom?: DOMProps;
};

// Lucide's shapes (ISC License), as paths.
const ICONS: Record<DescriptionTool | 'unlink', string[]> = {
  undo: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11'],
  redo: ['m15 14 5-5-5-5', 'M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13'],
  h1: ['M4 12h8', 'M4 18V6', 'M12 18V6', 'm17 12 3-2v8'],
  h2: ['M4 12h8', 'M4 18V6', 'M12 18V6', 'M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1'],
  h3: [
    'M4 12h8',
    'M4 18V6',
    'M12 18V6',
    'M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2',
    'M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2',
  ],
  paragraph: ['M13 4v16', 'M17 4v16', 'M19 4H9.5a4.5 4.5 0 0 0 0 9H13'],
  bold: ['M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8'],
  italic: ['M19 4h-9', 'M14 20H5', 'M15 4 9 20'],
  underline: ['M6 4v6a6 6 0 0 0 12 0V4', 'M4 20h16'],
  strike: ['M16 4H9a3 3 0 0 0-2.83 4', 'M14 12a4 4 0 0 1 0 8H6', 'M4 12h16'],
  bulletList: ['M3 12h.01', 'M3 18h.01', 'M3 6h.01', 'M8 12h13', 'M8 18h13', 'M8 6h13'],
  orderedList: [
    'M10 12h11',
    'M10 18h11',
    'M10 6h11',
    'M4 10h2',
    'M4 6h1v4',
    'M6 18H4c0-1 2-2 2-3s-1-1.5-2-1',
  ],
  blockquote: ['M17 6H3', 'M21 12H8', 'M21 18H8', 'M3 12v6'],
  link: [
    'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71',
    'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  ],
  unlink: [
    'm18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71',
    'm5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71',
    'M8 2v3',
    'M2 8h3',
    'M16 19v3',
    'M19 16h3',
  ],
  rule: ['M5 12h14'],
  clear: ['M4 7V4h16v3', 'M5 20h6', 'M13 4 8 20', 'm15 15 5 5', 'm20 15-5 5'],
};

const GROUPS: DescriptionTool[][] = [
  ['undo', 'redo'],
  ['bold', 'italic', 'underline', 'strike'],
  ['h1', 'h2', 'h3', 'paragraph'],
  ['bulletList', 'orderedList', 'blockquote'],
  ['link', 'rule', 'clear'],
];

/** What a press of each tool does, and whether it is on where the cursor is. */
const TOOLS: Record<
  DescriptionTool,
  { run: (editor: Editor) => unknown; active?: (editor: Editor) => boolean }
> = {
  undo: { run: (editor) => editor.chain().focus().undo().run() },
  redo: { run: (editor) => editor.chain().focus().redo().run() },
  h1: {
    run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    active: (editor) => editor.isActive('heading', { level: 1 }),
  },
  h2: {
    run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    active: (editor) => editor.isActive('heading', { level: 2 }),
  },
  h3: {
    run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    active: (editor) => editor.isActive('heading', { level: 3 }),
  },
  paragraph: {
    run: (editor) => editor.chain().focus().setParagraph().run(),
    active: (editor) => editor.isActive('paragraph') && !editor.isActive('listItem'),
  },
  bold: {
    run: (editor) => editor.chain().focus().toggleBold().run(),
    active: (editor) => editor.isActive('bold'),
  },
  italic: {
    run: (editor) => editor.chain().focus().toggleItalic().run(),
    active: (editor) => editor.isActive('italic'),
  },
  underline: {
    run: (editor) => editor.chain().focus().toggleUnderline().run(),
    active: (editor) => editor.isActive('underline'),
  },
  strike: {
    run: (editor) => editor.chain().focus().toggleStrike().run(),
    active: (editor) => editor.isActive('strike'),
  },
  bulletList: {
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
    active: (editor) => editor.isActive('bulletList'),
  },
  orderedList: {
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
    active: (editor) => editor.isActive('orderedList'),
  },
  blockquote: {
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
    active: (editor) => editor.isActive('blockquote'),
  },
  link: { run: () => undefined, active: (editor) => editor.isActive('link') },
  rule: { run: (editor) => editor.chain().focus().setHorizontalRule().run() },
  clear: { run: (editor) => editor.chain().focus().unsetAllMarks().clearNodes().run() },
};

/** A link the store accepts: the web, mail, a phone number, or a page of the store. */
function linkHref(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^(https?:|mailto:|tel:)/i.test(value) || value.startsWith('/')) return value;
  if (/^[\w-]+(\.[\w-]+)+/.test(value)) return `https://${value}`;
  return null;
}

function ToolIcon({ name }: { name: DescriptionTool | 'unlink' }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true">
      {ICONS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export default function DescriptionEditor({
  initialHtml,
  editable,
  placeholder,
  labels,
  colors,
  fontScale,
  direction,
  onChange,
  onFocusChange,
  onHeight,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        trailingNode: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      Image,
      Placeholder.configure({ placeholder }),
    ],
    content: initialHtml,
    editable,
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { 'aria-label': labels.editor, role: 'textbox' } },
    onUpdate: ({ editor: current }) => {
      void onChange(current.isEmpty ? '' : current.getHTML());
    },
    onFocus: () => void onFocusChange(true),
    onBlur: () => void onFocusChange(false),
  });

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  // The native side sizes the view to the content, up to a limit past which it scrolls.
  useEffect(() => {
    const element = root.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => void onHeight(Math.ceil(element.offsetHeight)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [onHeight]);

  const size = 15 * fontScale;
  const css = `
    html, body { margin: 0; padding: 0; background: ${colors.field}; color: ${colors.foreground};
      font-family: -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Segoe UI', sans-serif;
      font-size: ${size}px; line-height: 1.6; -webkit-text-size-adjust: 100%; }
    * { box-sizing: border-box; }
    .toolbar { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 2px;
      overflow-x: auto; scrollbar-width: none; padding: 6px; background: ${colors.field};
      border-bottom: 1px solid ${colors.border}; }
    .toolbar::-webkit-scrollbar { display: none; }
    .tool { flex: none; display: inline-flex; align-items: center; justify-content: center;
      width: 36px; height: 36px; border: 0; border-radius: 10px; background: transparent;
      color: ${colors.foreground}; padding: 0; -webkit-tap-highlight-color: transparent; }
    .tool[aria-pressed='true'] { background: ${colors.selected}; color: ${colors.selectedForeground}; }
    .tool:disabled { opacity: 0.35; }
    .divider { flex: none; width: 1px; height: 20px; margin: 0 4px; background: ${colors.border}; }
    .linkbar { display: flex; gap: 6px; align-items: center; padding: 8px;
      border-bottom: 1px solid ${colors.border}; }
    .linkbar input { flex: 1; min-width: 0; height: 36px; padding: 0 10px; border-radius: 10px;
      border: 1px solid ${colors.border}; background: transparent; color: ${colors.foreground};
      font: inherit; font-size: ${size}px; outline: none; }
    .linkbar input:focus { border-color: ${colors.foreground}; }
    .text-button { flex: none; height: 36px; padding: 0 10px; border: 0; border-radius: 999px;
      background: transparent; color: ${colors.link}; font: inherit; font-weight: 600; }
    .content { padding: 12px 16px 16px; min-height: 160px; cursor: text; }
    .ProseMirror { outline: none; min-height: 132px; word-wrap: break-word; }
    .ProseMirror > * + * { margin-top: 0.6em; }
    .ProseMirror p { margin: 0; }
    .ProseMirror h1, .ProseMirror h2, .ProseMirror h3 { margin: 0.9em 0 0; line-height: 1.3; font-weight: 700; }
    .ProseMirror > :first-child { margin-top: 0; }
    .ProseMirror h1 { font-size: 1.6em; }
    .ProseMirror h2 { font-size: 1.35em; }
    .ProseMirror h3 { font-size: 1.15em; }
    .ProseMirror ul, .ProseMirror ol { margin: 0; padding-inline-start: 1.4em; }
    .ProseMirror li p { margin: 0; }
    .ProseMirror blockquote { margin: 0; padding-inline-start: 12px; border-inline-start: 3px solid ${colors.border}; color: ${colors.muted}; }
    .ProseMirror hr { border: 0; border-top: 1px solid ${colors.border}; margin: 1em 0; }
    .ProseMirror a { color: ${colors.link}; text-decoration: underline; }
    .ProseMirror code { font-family: ui-monospace, Menlo, monospace; font-size: 0.9em; }
    .ProseMirror pre { margin: 0; padding: 10px 12px; border-radius: 10px; overflow-x: auto;
      border: 1px solid ${colors.border}; }
    .ProseMirror img { max-width: 100%; height: auto; border-radius: 10px; }
    .ProseMirror img.ProseMirror-selectednode { outline: 2px solid ${colors.link}; }
    .ProseMirror p.is-editor-empty:first-child::before { content: attr(data-placeholder);
      color: ${colors.muted}; float: left; height: 0; pointer-events: none; }
    [dir='rtl'] .ProseMirror p.is-editor-empty:first-child::before { float: right; }
  `;

  const keep = (event: { preventDefault: () => void }) => event.preventDefault();
  const press = (tool: DescriptionTool) => {
    if (!editor) return;
    if (tool === 'link') {
      setLinking(linking === null ? String(editor.getAttributes('link').href ?? '') : null);
      return;
    }
    TOOLS[tool].run(editor);
  };
  const applyLink = () => {
    if (!editor || linking === null) return;
    const href = linkHref(linking);
    if (href) editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    else editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setLinking(null);
  };
  const disabled = (tool: DescriptionTool) =>
    !editable ||
    !editor ||
    (tool === 'undo' && !editor.can().undo()) ||
    (tool === 'redo' && !editor.can().redo());

  const wrapper: CSSProperties = { opacity: editable ? 1 : 0.5 };
  return (
    <div ref={root} dir={direction} style={wrapper}>
      <style>{css}</style>
      <div className="toolbar" role="toolbar" aria-label={labels.toolbar}>
        {GROUPS.map((group, index) => (
          <div key={group.join()} style={{ display: 'contents' }}>
            {index > 0 ? <span className="divider" aria-hidden="true" /> : null}
            {group.map((tool) => (
              <button
                key={tool}
                type="button"
                className="tool"
                title={labels[tool]}
                aria-label={labels[tool]}
                aria-pressed={editor && TOOLS[tool].active ? TOOLS[tool].active(editor) : undefined}
                disabled={disabled(tool)}
                onPointerDown={keep}
                onMouseDown={keep}
                onClick={() => press(tool)}>
                <ToolIcon name={tool} />
              </button>
            ))}
          </div>
        ))}
      </div>
      {linking !== null ? (
        <div className="linkbar">
          <input
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            aria-label={labels.linkUrl}
            placeholder={labels.linkUrl}
            value={linking}
            autoFocus
            onChange={(event) => setLinking(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                applyLink();
              }
            }}
          />
          {editor?.isActive('link') ? (
            <button
              type="button"
              className="tool"
              aria-label={labels.removeLink}
              title={labels.removeLink}
              onClick={() => {
                editor.chain().focus().extendMarkRange('link').unsetLink().run();
                setLinking(null);
              }}>
              <ToolIcon name="unlink" />
            </button>
          ) : null}
          <button type="button" className="text-button" onClick={() => setLinking(null)}>
            {labels.cancelLink}
          </button>
          <button type="button" className="text-button" onClick={applyLink}>
            {labels.applyLink}
          </button>
        </div>
      ) : null}
      <div
        className="content"
        onClick={(event) => {
          if (event.target === event.currentTarget) editor?.commands.focus('end');
        }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
