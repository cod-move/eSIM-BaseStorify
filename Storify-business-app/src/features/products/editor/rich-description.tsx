import { useCallback, useEffect, useRef, useState } from 'react';
import { PixelRatio, Pressable, View } from 'react-native';
import { useCSSVariable, useUniwind } from 'uniwind';
import { useFormatter, useTranslations } from 'use-intl';

import { Text } from '@/components/ui/text';
import {
  FieldLabel,
  FieldMessage,
  TextField,
  fieldBoxClass,
  useFieldSurface,
} from '@/components/ui/text-field';
import { useRtl } from '@/i18n/use-rtl';
import { cn } from '@/lib/cn';

import DescriptionEditor, {
  type DescriptionEditorColors,
  type DescriptionEditorLabels,
  type DescriptionTool,
} from './description-editor';

const MAX_LENGTH = 10_000;
const MIN_HEIGHT = 220;
const MAX_HEIGHT = 480;

// What the visual editor keeps exactly: the web dashboard's TipTap set.
const VISUAL_TAGS = new Set([
  'p',
  'br',
  'h1',
  'h2',
  'h3',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'del',
  'code',
  'pre',
  'ul',
  'ol',
  'li',
  'blockquote',
  'hr',
  'a',
  'img',
]);
const VISUAL_ATTRIBUTES = new Set(['href', 'target', 'rel', 'src', 'alt', 'title', 'start']);

/**
 * Whether the visual editor can open this HTML without losing any of it. A
 * description written elsewhere with tables, classes or styles stays in the
 * HTML source, which keeps every byte.
 */
export function visualEditable(html: string): boolean {
  for (const [, tag, attributes] of html.matchAll(/<\/?([a-z][a-z\d]*)\b([^>]*)>/gi)) {
    if (!VISUAL_TAGS.has(tag!.toLowerCase())) return false;
    for (const [, name] of attributes!.matchAll(
      /([^\s=/]+)\s*(?:=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/g
    ))
      if (!VISUAL_ATTRIBUTES.has(name!.toLowerCase())) return false;
  }
  return true;
}

const TOOLS: DescriptionTool[] = [
  'undo',
  'redo',
  'h1',
  'h2',
  'h3',
  'paragraph',
  'bold',
  'italic',
  'underline',
  'strike',
  'bulletList',
  'orderedList',
  'blockquote',
  'link',
  'rule',
  'clear',
];

function useEditorColors(): DescriptionEditorColors {
  const surface = useFieldSurface();
  const { theme } = useUniwind();
  const [foreground, muted, card, cardAlt, border, link, primary, primaryForeground] =
    useCSSVariable([
      '--color-foreground',
      '--color-muted',
      '--color-surface',
      '--color-surface-alt',
      '--color-border',
      '--color-link',
      '--color-primary',
      '--color-primary-foreground',
    ]);
  // The same fill as a text field on this surface (see `fieldBoxClass`).
  const field = surface === 'surface' || theme === 'dark' ? cardAlt : card;
  return {
    foreground: String(foreground),
    muted: String(muted),
    field: String(field),
    border: String(border),
    link: String(link),
    selected: String(primary),
    selectedForeground: String(primaryForeground),
  };
}

/**
 * The product's description: written in a visual editor with the web
 * dashboard's toolbar, or as HTML source. Both keep the same HTML; the store
 * sanitises what it receives.
 */
export function RichDescription({
  value,
  onChange,
  disabled,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  error?: string;
}) {
  const t = useTranslations('products.editor');
  const format = useFormatter();
  const rtl = useRtl();
  const surface = useFieldSurface();
  const colors = useEditorColors();
  const visualAllowed = visualEditable(value);
  const [mode, setMode] = useState<'visual' | 'html'>(visualAllowed ? 'visual' : 'html');
  const [height, setHeight] = useState(MIN_HEIGHT);
  const [focused, setFocused] = useState(false);
  // A value the editor did not write (a conflict resolved, the HTML edited)
  // opens the visual editor again on it.
  const written = useRef(value);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (value === written.current) return;
    written.current = value;
    setRevision((current) => current + 1);
  }, [value]);
  const handleChange = useCallback(
    async (html: string) => {
      written.current = html;
      onChange(html);
    },
    [onChange]
  );
  const handleFocus = useCallback(async (next: boolean) => setFocused(next), []);
  const handleHeight = useCallback(
    async (next: number) => setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, next))),
    []
  );
  const labels = {
    ...Object.fromEntries(TOOLS.map((tool) => [tool, t(`tools.${tool}`)])),
    toolbar: t('tools.toolbar'),
    editor: t('description'),
    linkUrl: t('tools.linkUrl'),
    applyLink: t('tools.applyLink'),
    removeLink: t('tools.removeLink'),
    cancelLink: t('tools.cancelLink'),
  } as DescriptionEditorLabels;
  const modes = [
    { value: 'visual', label: t('descriptionModes.visual'), disabled: !visualAllowed },
    { value: 'html', label: t('descriptionModes.html'), disabled: false },
  ] as const;

  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <FieldLabel label={t('description')} required />
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t('descriptionMode')}
          className="flex-row rounded-full bg-surface-alt p-0.5">
          {modes.map((item) => {
            const selected = mode === item.value;
            return (
              <Pressable
                key={item.value}
                accessibilityRole="radio"
                accessibilityLabel={item.label}
                accessibilityState={{ checked: selected, disabled: item.disabled }}
                disabled={item.disabled}
                hitSlop={6}
                onPress={() => {
                  written.current = value;
                  setMode(item.value);
                }}
                className={cn(
                  'min-h-8 justify-center rounded-full px-3.5',
                  selected && 'bg-surface shadow-button dark:bg-surface-alt',
                  item.disabled && 'opacity-40'
                )}>
                <Text variant="chip" className={selected ? undefined : 'text-muted'}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {mode === 'visual' ? (
        <View
          className={cn(
            fieldBoxClass({ on: surface, focused, error: Boolean(error), disabled }),
            'items-stretch overflow-hidden'
          )}>
          <DescriptionEditor
            key={revision}
            initialHtml={value}
            editable={!disabled}
            placeholder={t('descriptionPlaceholder')}
            labels={labels}
            colors={colors}
            fontScale={PixelRatio.getFontScale()}
            direction={rtl ? 'rtl' : 'ltr'}
            onChange={handleChange}
            onFocusChange={handleFocus}
            onHeight={handleHeight}
            dom={{
              style: { height, width: '100%', backgroundColor: 'transparent' },
              scrollEnabled: height >= MAX_HEIGHT,
              nestedScrollEnabled: true,
              hideKeyboardAccessoryView: true,
              keyboardDisplayRequiresUserAction: false,
            }}
          />
        </View>
      ) : (
        <TextField
          label={t('descriptionHtml')}
          hideLabel
          value={value}
          multiline
          required
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          maxLength={MAX_LENGTH}
          editable={!disabled}
          error={error}
          inputClassName="min-h-48 font-mono text-[13px] leading-5"
          onChangeText={onChange}
        />
      )}
      <View className="flex-row items-start gap-3">
        <View className="flex-1">
          {mode === 'visual' ? (
            <FieldMessage error={error} />
          ) : (
            <Text variant="caption">{t(visualAllowed ? 'htmlHint' : 'htmlOnlyHint')}</Text>
          )}
        </View>
        <Text variant="caption" className="tabular-nums">
          {t('characterCount', {
            count: format.number(value.length),
            max: format.number(MAX_LENGTH),
          })}
        </Text>
      </View>
    </View>
  );
}
