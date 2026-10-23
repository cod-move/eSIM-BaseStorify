import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslations } from 'use-intl';

import { SelectField } from '@/components/ui/select-field';
import { SwitchRow, SwitchSection } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';

import { FormSectionContext } from '@/components/ui/form-sections';

import { readPrice, readUnits } from '../typed-input';

/** Registers a field that refuses its input, under its section: `pricing|:r3:`. */
export const EditorValidationContext = createContext<(id: string, invalid: boolean) => void>(
  () => undefined
);

/** A separator typed last, the decimals still to come: `12,` is 12 so far. */
const TRAILING_SEPARATOR = /[.,٫]$/;

/**
 * What was typed, read as the quick edit reads it (`typed-input.ts`): the
 * keyboard's own digits (Arabic, Bengali …) and a decimal comma (`12,50`) too.
 */
export function readEditorNumber(text: string, integer: boolean): number | null {
  if (integer) return readUnits(text);
  const typed = readPrice(text.replace(TRAILING_SEPARATOR, ''));
  return typed.kind === 'price' ? typed.value : null;
}

/** Raw form numbers only. Monetary displays always come from the server. */
export function EditorNumber({
  label,
  value,
  onChange,
  disabled = false,
  integer = false,
  optional = false,
  unit,
  hint,
  placeholder,
  marker = true,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (value: number | undefined) => void;
  disabled?: boolean;
  integer?: boolean;
  optional?: boolean;
  /** Drawn at the end of the box: the currency's code, "kg", "days". */
  unit?: string;
  hint?: string;
  placeholder?: string;
  /** Marks the label "Optional" or required; off where the fields beside it share one mark. */
  marker?: boolean;
}) {
  const t = useTranslations('products.editor');
  const id = useId();
  const section = useContext(FormSectionContext);
  const register = useContext(EditorValidationContext);
  const [text, setText] = useState(value == null ? '' : String(value));
  const emitted = useRef(value);
  useEffect(() => {
    if (!Object.is(emitted.current, value)) {
      setText(value == null ? '' : String(value));
      emitted.current = value;
    }
  }, [value]);
  const invalid =
    !disabled && (text.trim() === '' ? !optional : readEditorNumber(text, integer) === null);
  useEffect(() => {
    const key = `${section}|${id}`;
    register(key, invalid);
    return () => register(key, false);
  }, [id, section, invalid, register]);
  return (
    <TextField
      label={label}
      value={text}
      editable={!disabled}
      optional={marker && optional}
      required={marker && !optional}
      placeholder={placeholder}
      hint={hint}
      keyboardType={integer ? 'number-pad' : 'decimal-pad'}
      inputMode={integer ? 'numeric' : 'decimal'}
      error={invalid && text !== '' ? t('invalidNumber') : undefined}
      end={
        unit ? (
          <Text variant="meta" className="pe-3">
            {unit}
          </Text>
        ) : undefined
      }
      onChangeText={(next) => {
        setText(next);
        const read = readEditorNumber(next, integer);
        if (next.trim() === '') {
          emitted.current = undefined;
          onChange(undefined);
        } else if (read !== null) {
          emitted.current = read;
          onChange(read);
        }
      }}
    />
  );
}

/**
 * A yes-or-no setting of the product: the house switch row. One that brings
 * fields with it is given them as children, and shows them inside its own box
 * while it is on (`SwitchSection`).
 */
export function EditorToggle({
  label,
  description,
  value,
  onChange,
  disabled = false,
  children,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const row = { title: label, description, value, onChange, disabled };
  return children === undefined ? (
    <SwitchRow {...row} />
  ) : (
    <SwitchSection {...row}>{children}</SwitchSection>
  );
}

/** A choice from a list: the shared select field. */
export const EditorChoice = SelectField;
