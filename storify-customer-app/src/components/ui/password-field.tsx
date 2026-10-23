import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { cn } from '@/lib/cn';

import { Icon } from './icon';
import { Text } from './text';
import { TextField, type TextFieldProps } from './text-field';

/** One of the store's password rules, worded by the screen, and whether the typed password meets it. */
type PasswordRule = {
  label: string;
  met: boolean;
};

export type PasswordFieldProps = Omit<TextFieldProps, 'secureTextEntry' | 'end'> & {
  /**
   * The store's rules (`config.passwordPolicy`), shown under the field as the
   * shopper types. The field only shows them: the screen words each rule and
   * says whether it is met, and the store has the last word when the form is sent.
   */
  rules?: readonly PasswordRule[];
};

/**
 * A text field for a password, with a button at its end that shows or hides
 * what was typed. It answers to the phone's
 * password manager: pass `autoComplete="new-password"` and
 * `textContentType="newPassword"` where a password is being chosen.
 */
export function PasswordField({ rules, className, ...props }: PasswordFieldProps) {
  const t = useTranslations('fields');
  const [visible, setVisible] = useState(false);

  return (
    <View className={cn('gap-2', className)}>
      <TextField
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        {...props}
        secureTextEntry={!visible}
        end={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={visible ? t('hidePassword') : t('showPassword')}
            disabled={props.editable === false}
            onPress={() => setVisible((shown) => !shown)}
            className="size-11 items-center justify-center rounded-full active:opacity-60">
            <Icon name={visible ? 'eye-off' : 'eye'} size={20} colorClassName="accent-muted" />
          </Pressable>
        }
      />
      {rules?.length ? (
        <View className="gap-1.5">
          {rules.map((rule) => (
            <View
              key={rule.label}
              accessible
              accessibilityLabel={t(rule.met ? 'ruleMet' : 'ruleUnmet', { rule: rule.label })}
              className="flex-row items-center gap-2">
              {/* A tick when met, an empty ring when not: the shape says it as well as the colour. */}
              {rule.met ? (
                <Icon name="check-circle" size={16} colorClassName="accent-success" />
              ) : (
                <View className="m-px size-3.5 rounded-full border-[1.5px] border-muted" />
              )}
              <Text variant="caption" className={cn('flex-1', rule.met && 'text-foreground')}>
                {rule.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
