import { getDocumentAsync } from 'expo-document-picker';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { isApiError } from '@/api/errors';
import { uploadEsimKycFile } from '@/api/endpoints/esims';
import { useTabBarHeight } from '@/components/shell/tab-bar';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import type { EsimKyc, EsimKycField } from '@/contracts/mobile/shop/v1/esim';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useLocale } from '@/i18n/locale-store';

import { useSubmitEsimKyc } from './use-account';

/**
 * Identity verification (APP-07): where the shopper stands, and the store's
 * form while one can be sent. A document is uploaded as soon as it is
 * picked, privately; the form then names it.
 */
export function KycView({ kyc }: { kyc: EsimKyc }) {
  const t = useTranslations('esim');
  const format = useFormatter();
  const tabBar = useTabBarHeight();

  const status = (
    <View className="gap-1 rounded-xl bg-surface p-4">
      <Text variant="subheading">
        {kyc.status === 'approved'
          ? t('kycApproved')
          : kyc.status === 'pending'
            ? t('kycPending', {
                date: kyc.submittedAt
                  ? format.dateTime(new Date(kyc.submittedAt), { dateStyle: 'medium' })
                  : '',
              })
            : kyc.status === 'rejected'
              ? t('kycRejected', { reason: kyc.reason ?? '' })
              : t('kycWhy')}
      </Text>
    </View>
  );

  const open = kyc.status === 'none' || kyc.status === 'rejected';
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-4 px-4 pt-3"
      contentContainerStyle={{ paddingBottom: tabBar + 16 }}
      keyboardShouldPersistTaps="handled">
      {status}
      {open && kyc.form ? <KycForm kyc={kyc} /> : null}
      {open && !kyc.form ? <Text className="text-muted">{t('kycClosed')}</Text> : null}
      <Text variant="caption">{t('kycPrivacy')}</Text>
    </ScrollView>
  );
}

function KycForm({ kyc }: { kyc: EsimKyc }) {
  const t = useTranslations('esim');
  const locale = useLocale();
  const toast = useToast();
  const describe = useErrorMessage();
  const submit = useSubmitEsimKyc();
  const [values, setValues] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, { id: string; name: string }>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fields = kyc.form?.fields ?? [];

  const pick = async (field: EsimKycField) => {
    const result = await getDocumentAsync({ type: kyc.fileTypes, copyToCacheDirectory: true });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    if (asset.size && asset.size > kyc.maxFileBytes) {
      setErrors((current) => ({ ...current, [field.key]: t('kycTooLarge') }));
      return;
    }
    setUploading(field.key);
    try {
      const stored = await uploadEsimKycFile(locale, field.key, {
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType ?? 'application/octet-stream',
      });
      setFiles((current) => ({ ...current, [field.key]: stored }));
      setErrors((current) => ({ ...current, [field.key]: '' }));
    } catch (error) {
      setErrors((current) => ({ ...current, [field.key]: describe(error) }));
    } finally {
      setUploading(null);
    }
  };

  const send = () =>
    submit.mutate(
      {
        values,
        files: Object.fromEntries(Object.entries(files).map(([key, file]) => [key, file.id])),
      },
      {
        onSuccess: () => toast.show({ message: t('kycSent') }),
        onError: (error: unknown) => {
          if (isApiError(error) && error.errors) {
            setErrors(
              Object.fromEntries(
                Object.entries(error.errors).map(([key, list]) => [key, list[0] ?? ''])
              )
            );
          }
          toast.show({ message: describe(error) });
        },
      }
    );

  return (
    <View className="gap-4 rounded-xl bg-surface p-4">
      <Text variant="subheading">{t('kycYourDetails')}</Text>
      {fields.map((field) => {
        const error = errors[field.key] || undefined;
        if (field.type === 'file') {
          return (
            <View key={field.key} className="gap-1.5">
              <Text variant="label">
                {field.label}
                {field.required ? ' *' : ''}
              </Text>
              {field.help ? <Text variant="caption">{field.help}</Text> : null}
              {files[field.key] ? <Text>{files[field.key]?.name}</Text> : null}
              <Button
                label={files[field.key] ? t('kycReplaceFile') : t('kycChooseFile')}
                variant="outline"
                size="sm"
                icon="paperclip"
                disabled={!kyc.uploadsReady}
                loading={uploading === field.key}
                onPress={() => void pick(field)}
                className="self-start"
              />
              {!kyc.uploadsReady ? <Text variant="caption">{t('kycNoUploads')}</Text> : null}
              {error ? (
                <Text variant="caption" className="text-danger">
                  {error}
                </Text>
              ) : null}
            </View>
          );
        }
        if (field.type === 'select') {
          return (
            <View key={field.key} className="gap-1.5">
              <Text variant="label">
                {field.label}
                {field.required ? ' *' : ''}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {field.options.map((option) => (
                  <Chip
                    key={option}
                    label={option}
                    selected={values[field.key] === option}
                    onPress={() => setValues((current) => ({ ...current, [field.key]: option }))}
                  />
                ))}
              </View>
              {error ? (
                <Text variant="caption" className="text-danger">
                  {error}
                </Text>
              ) : null}
            </View>
          );
        }
        return (
          <TextField
            key={field.key}
            label={field.label}
            required={field.required}
            on="surface"
            value={values[field.key] ?? ''}
            onChangeText={(text) => setValues((current) => ({ ...current, [field.key]: text }))}
            multiline={field.type === 'textarea'}
            placeholder={field.type === 'date' ? 'YYYY-MM-DD' : undefined}
            hint={field.help}
            error={error}
          />
        );
      })}
      <Button
        label={t('kycSend')}
        loading={submit.isPending}
        disabled={uploading !== null}
        onPress={send}
      />
    </View>
  );
}
