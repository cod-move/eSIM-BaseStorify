import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { cn } from '@/lib/cn';

import { Icon } from './icon';
import { RadioRow, RowGroup } from './rows';
import { SearchField } from './search-field';
import { Sheet } from './sheet';
import { Text } from './text';
import { FieldLabel, FieldMessage, fieldBoxClass, useFieldSurface } from './text-field';

/**
 * A choice from a list, drawn as a field (label above, the chosen value in the
 * box) that opens a sheet of radio rows. A long list gets a search field.
 */
export type SelectFieldProps = {
  label: string;
  value: string;
  choices: readonly { value: string; label: string; description?: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  optional?: boolean;
  required?: boolean;
  hint?: string;
  error?: string;
  placeholder?: string;
  /** Under the list in the sheet: what the list leaves to the website. */
  footer?: ReactNode;
};

export function SelectField({
  label,
  value,
  choices,
  onChange,
  disabled = false,
  optional = false,
  required = false,
  hint,
  error,
  placeholder,
  footer,
}: SelectFieldProps) {
  const t = useTranslations('fields');
  const surface = useFieldSurface();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = choices.find((choice) => choice.value === value);
  const shown = selected?.label ?? (value || undefined);
  const visible = choices.filter((choice) =>
    choice.label.toLocaleLowerCase().includes(search.toLocaleLowerCase())
  );
  return (
    <View className="gap-2">
      <FieldLabel label={label} optional={optional} required={required} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: shown ?? t('choose') }}
        accessibilityHint={error ?? hint}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => {
          setSearch('');
          setOpen(true);
        }}
        className={cn(
          fieldBoxClass({ on: surface, error: Boolean(error), disabled }),
          'gap-2 px-4'
        )}>
        <Text numberOfLines={1} className={cn('flex-1 py-3', !shown && 'text-muted')}>
          {shown ?? placeholder ?? t('choose')}
        </Text>
        <Icon name="chevron-down" size={18} colorClassName="accent-muted" />
      </Pressable>
      <FieldMessage error={error} hint={hint} />
      <Sheet visible={open} title={label} onClose={() => setOpen(false)}>
        <View className="gap-3">
          {choices.length > 8 ? (
            <SearchField value={search} onChangeText={setSearch} label={t('searchChoices')} />
          ) : null}
          <RowGroup bare>
            {visible.map((choice) => (
              <RadioRow
                key={choice.value}
                title={choice.label}
                description={choice.description}
                selected={choice.value === value}
                onSelect={() => {
                  onChange(choice.value);
                  setOpen(false);
                }}
              />
            ))}
          </RowGroup>
          {visible.length === 0 ? <Text className="text-muted">{t('noChoices')}</Text> : null}
          {footer}
        </View>
      </Sheet>
    </View>
  );
}
