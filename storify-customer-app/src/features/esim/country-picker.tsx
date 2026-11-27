import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { RadioRow } from '@/components/ui/rows';
import { SearchField } from '@/components/ui/search-field';
import { SelectButton } from '@/components/ui/select-button';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';

import type { StoreCountry } from './address-fields';

/** A country's flag as an emoji, from its ISO code. */
function flagEmoji(code: string): string {
  return /^[A-Z]{2}$/.test(code)
    ? String.fromCodePoint(...[...code].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65))
    : '';
}

/** The country among the store's that a saved value names: its English name, its ISO code, or its name here. */
export function findStoreCountry(
  countries: StoreCountry[],
  value: string
): StoreCountry | undefined {
  const typed = value.trim().toLowerCase();
  if (!typed) return undefined;
  return countries.find(
    (country) =>
      country.value.toLowerCase() === typed ||
      country.code.toLowerCase() === typed ||
      country.name.toLowerCase() === typed
  );
}

type CountryPickerProps = {
  label: string;
  countries: StoreCountry[];
  /** What the address stores: the store's English name. */
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
};

/**
 * The address form's country: a field that opens the countries the store
 * delivers to, in the shopper's language, with a search. The address stores
 * the store's own name for it, as the website saves it, so the store's
 * country check always knows it.
 */
export function CountryPicker({
  label,
  countries,
  value,
  onChange,
  required,
  error,
}: CountryPickerProps) {
  const t = useTranslations('esim.countryPicker');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const chosen = findStoreCountry(countries, value);

  const shown = useMemo(() => {
    const typed = query.trim().toLowerCase();
    if (!typed) return countries;
    return countries.filter(
      (country) =>
        country.name.toLowerCase().includes(typed) ||
        country.value.toLowerCase().includes(typed) ||
        country.code.toLowerCase() === typed
    );
  }, [countries, query]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <SelectButton
        label={label}
        required={required}
        optional={!required}
        // A saved country the store no longer lists still shows, so the shopper sees what to change.
        value={chosen ? chosen.name : value || undefined}
        placeholder={t('choose')}
        leading={chosen ? <Text>{flagEmoji(chosen.code)}</Text> : undefined}
        error={error}
        open={open}
        onPress={() => setOpen(true)}
      />
      <Sheet visible={open} title={label} size="tall" onClose={close}>
        <View className="gap-2 px-4 pb-4">
          <SearchField
            label={t('search')}
            placeholder={t('search')}
            value={query}
            onChangeText={setQuery}
          />
          {shown.length === 0 ? (
            <Text variant="body" className="py-6 text-center text-muted">
              {t('none')}
            </Text>
          ) : null}
          <View accessibilityRole="radiogroup">
            {shown.map((country) => (
              <RadioRow
                key={country.code}
                title={`${flagEmoji(country.code)}  ${country.name}`}
                selected={chosen?.code === country.code}
                onSelect={() => {
                  onChange(country.value);
                  close();
                }}
              />
            ))}
          </View>
        </View>
      </Sheet>
    </>
  );
}
