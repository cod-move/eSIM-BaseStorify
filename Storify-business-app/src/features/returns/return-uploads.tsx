import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import type { BizUpload, UploadPolicy, UploadTarget } from '@/contracts/mobile/biz/v1';
import { selectUploadFile } from '@/features/uploads/select-file';
import type { UploadFileSource } from '@/features/uploads/pick-asset';
import type { SelectedUploadFile } from '@/features/uploads/selected-file';
import { useUploadFile } from '@/features/uploads/use-upload';
import { useUploadErrorMessage } from '@/features/uploads/use-upload-error-message';
import { Banner } from '@/components/ui/banner';
export function ReturnUploads({
  target,
  policy,
  files,
  disabled,
  onFiles,
  onBusy,
}: {
  target: UploadTarget;
  policy: UploadPolicy;
  files: BizUpload[];
  disabled: boolean;
  onFiles: (files: BizUpload[]) => void;
  onBusy: (busy: boolean) => void;
}) {
  const t = useTranslations('returns');
  const phases = useTranslations('uploads.phase');
  const uploader = useUploadFile();
  const describe = useUploadErrorMessage();
  const [selected, setSelected] = useState<SelectedUploadFile | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [picking, setPicking] = useState(false);
  const latest = useRef({ files, onFiles });
  useLayoutEffect(() => {
    latest.current = { files, onFiles };
  }, [files, onFiles]);
  const phase = uploader.job.phase;
  // Only a file on its way, or being checked, holds the form. One whose outcome
  // is not known can be checked, sent again or let go (Discard): it never traps the operator.
  const busy = picking || ['sending', 'reconciling'].includes(phase);
  const unsettled = ['unknown', 'cancelled', 'failed', 'notReceived'].includes(phase);
  useEffect(() => {
    onBusy(busy);
    return () => onBusy(false);
  }, [busy, onBusy]);
  const upload = uploader.job.upload;
  useEffect(() => {
    if (upload && !latest.current.files.some((f) => f.id === upload.id))
      latest.current.onFiles([...latest.current.files, upload]);
  }, [upload]);
  const pick = async (source: UploadFileSource) => {
    setError(null);
    setPicking(true);
    try {
      const file = await selectUploadFile(source, policy);
      if (!file) return;
      setSelected(file);
      await uploader.submit({ target, purpose: policy.purpose }, file);
    } catch (failure) {
      setError(failure);
    } finally {
      setPicking(false);
    }
  };
  return (
    <View className="gap-3">
      <Text variant="section">{t(policy.purpose === 'return_label' ? 'label' : 'evidence')}</Text>
      <View className="flex-row flex-wrap gap-2">
        {(['camera', 'photo-library', 'document'] as const).map((source) => (
          <Button
            key={source}
            label={t(`sources.${source}`)}
            size="sm"
            variant="secondary"
            disabled={disabled || busy || files.length >= policy.maxFiles}
            onPress={() => void pick(source)}
          />
        ))}
      </View>
      {files.map((file) => (
        <View key={file.id} className="gap-2">
          <Text>{file.filename}</Text>
          <Button
            label={t('removeFile', { name: file.filename })}
            variant="ghost"
            size="sm"
            disabled={disabled || busy}
            onPress={() => onFiles(files.filter((f) => f.id !== file.id))}
          />
        </View>
      ))}
      {busy ? <Text>{t('uploadPending')}</Text> : null}
      {unsettled ? <Text className="text-muted">{phases(phase)}</Text> : null}
      {uploader.isPending ? (
        <Button label={t('cancelUpload')} variant="secondary" onPress={uploader.cancel} />
      ) : null}
      {unsettled ? (
        <>
          {phase === 'unknown' || phase === 'cancelled' ? (
            <Button
              label={t('checkUpload')}
              loading={uploader.isPending}
              onPress={() => void uploader.reconcile().catch(setError)}
            />
          ) : null}
          {selected ? (
            <Button
              label={t('retryUpload')}
              disabled={uploader.isPending}
              onPress={() =>
                void uploader.submit({ target, purpose: policy.purpose }, selected).catch(setError)
              }
            />
          ) : null}
          <Button
            label={t('discardUpload')}
            variant="ghost"
            disabled={uploader.isPending}
            onPress={() => {
              uploader.discard();
              setSelected(null);
              setError(null);
            }}
          />
        </>
      ) : null}
      {error ? <Banner tone="danger" message={describe(error)} /> : null}
    </View>
  );
}
