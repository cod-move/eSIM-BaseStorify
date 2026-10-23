import { CameraView, useCameraPermissions, type PermissionResponse } from 'expo-camera';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { IconCircle } from '@/components/ui/icon-circle';
import { RowGroup } from '@/components/ui/rows';
import { Text } from '@/components/ui/text';
import { FieldSurfaceProvider, TextField } from '@/components/ui/text-field';
import type { ProductListItem } from '@/contracts/mobile/biz/v1';
import { useErrorMessage } from '@/i18n/use-error-message';

import { ProductRow } from '../product-row';
import { SCANNED_TYPES, codeOf, useScanner, type ScanState } from './use-scanner';

/**
 * The barcode scanner, a full-screen modal over the
 * tabs: the camera with a frame to aim, the light, and a panel under it that
 * takes a typed code and shows the outcome of a scan. One product found opens
 * it in the scanner's place; several are listed; none says so.
 *
 * The camera needs the operator's permission, asked for here, at the moment
 * it is needed, with the reason on screen. Typing the code works without it.
 * Refused for good, it is turned on in the phone's Settings: the permission is
 * read again whenever the app comes back to the front.
 */
export function ScannerScreen() {
  const titles = useTranslations('shell.titles');
  const common = useTranslations('common');
  const t = useTranslations('products.scanner');
  const [permission, requestPermission, readPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  // The code goes along, so the product's page can show the variant that carries it.
  const open = useCallback((product: ProductListItem, code: string) => {
    router.replace({ pathname: '/products/[id]', params: { id: product.id, code } });
  }, []);
  const scanner = useScanner(open);
  const granted = permission?.granted === true;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/products'));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (appState) => {
      // A phone that cannot say keeps what it said before.
      if (appState === 'active') void readPermission().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [readPermission]);

  return (
    <View className="flex-1 bg-scrim">
      {granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: SCANNED_TYPES }}
          enableTorch={torch}
          // Off while an outcome is on screen, so the camera stops reporting.
          onBarcodeScanned={
            scanner.state.step === 'scanning' ? (read) => scanner.onRead(read.data) : undefined
          }
        />
      ) : null}

      <View className="flex-1 pt-safe">
        <View className="min-h-14 flex-row items-center gap-3 px-4 py-2">
          <IconButton icon="close" label={common('close')} onPress={close} />
          <Text
            variant="title"
            accessibilityRole="header"
            numberOfLines={1}
            className="flex-1 text-center text-on-scrim">
            {titles('scanner')}
          </Text>
          {/* A browser's camera has no light to switch on. */}
          {granted && Platform.OS !== 'web' ? (
            <IconButton
              icon={torch ? 'flashlight-off' : 'flashlight'}
              label={torch ? t('torchOff') : t('torchOn')}
              onPress={() => setTorch((on) => !on)}
            />
          ) : (
            <View className="size-10" />
          )}
        </View>

        <View className="flex-1 items-center justify-center px-8">
          {granted ? (
            <Viewfinder />
          ) : (
            <PermissionPrompt permission={permission} onAsk={() => void requestPermission()} />
          )}
        </View>

        <Panel
          state={scanner.state}
          onOpen={open}
          onTyped={scanner.onTyped}
          onScanAgain={scanner.scanAgain}
          onRetry={scanner.retry}
          cameraOn={granted}
        />
      </View>
    </View>
  );
}

/** Corners to aim with, wide for a barcode, and what to do. Drawn over the camera, so always light on dark. */
function Viewfinder() {
  const t = useTranslations('products.scanner');
  const corner = 'absolute size-8 border-on-scrim';

  return (
    <View className="w-full items-center gap-6">
      <View
        className="h-40 w-full max-w-[300px]"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden>
        <View className={`${corner} start-0 top-0 border-s-4 border-t-4`} />
        <View className={`${corner} end-0 top-0 border-e-4 border-t-4`} />
        <View className={`${corner} start-0 bottom-0 border-b-4 border-s-4`} />
        <View className={`${corner} end-0 bottom-0 border-e-4 border-b-4`} />
      </View>
      <View className="rounded-full bg-scrim/60 px-4 py-2">
        <Text className="text-center text-on-scrim">{t('hint')}</Text>
      </View>
    </View>
  );
}

function PermissionPrompt({
  permission,
  onAsk,
}: {
  permission: PermissionResponse | null;
  onAsk: () => void;
}) {
  const t = useTranslations('products.scanner');
  const light = useCSSVariable('--color-on-scrim');

  if (!permission) return <ActivityIndicator color={light ? String(light) : undefined} />;
  // Asked before and refused: only the phone's Settings can turn it on now.
  const blocked = !permission.canAskAgain;

  return (
    <View className="max-w-[320px] items-center gap-3">
      <IconCircle icon="camera" size="lg" />
      <Text variant="subheading" accessibilityRole="header" className="text-center text-on-scrim">
        {blocked ? t('deniedTitle') : t('permissionTitle')}
      </Text>
      <Text className="text-center text-on-scrim/80">
        {blocked ? t('deniedBody') : t('permissionBody')}
      </Text>
      <Button
        label={blocked ? t('openSettings') : t('permissionAction')}
        variant="accent"
        onPress={blocked ? () => void Linking.openSettings() : onAsk}
        className="mt-3"
      />
    </View>
  );
}

type PanelProps = {
  state: ScanState;
  onOpen: (product: ProductListItem, code: string) => void;
  onTyped: (code: string) => void;
  onScanAgain: () => void;
  onRetry: () => void;
  /** Whether there is a camera to go back to. */
  cameraOn: boolean;
};

/** Under the camera: the outcome of the last scan, and a field to type the code. It rises with the keyboard. */
function Panel({ state, onOpen, onTyped, onScanAgain, onRetry, cameraOn }: PanelProps) {
  const t = useTranslations('products.scanner');
  const common = useTranslations('common');
  const describe = useErrorMessage();
  const muted = useCSSVariable('--color-muted');
  const { bottom } = useSafeAreaInsets();
  const [typed, setTyped] = useState('');
  const looking = state.step === 'looking';
  const submit = () => onTyped(typed);
  const scanAgain =
    cameraOn && state.step !== 'scanning' && !looking ? (
      <Button
        label={t('scanAgain')}
        variant="secondary"
        icon="scan-barcode"
        onPress={onScanAgain}
      />
    ) : null;

  return (
    <KeyboardStickyView offset={{ opened: bottom }}>
      <FieldSurfaceProvider value="surface">
        <View className="gap-4 rounded-t-sheet bg-surface px-4 pt-5 pb-safe-offset-4">
          {looking ? (
            <View
              accessibilityLiveRegion="polite"
              className="flex-row items-center justify-center gap-3 py-2">
              <ActivityIndicator color={muted ? String(muted) : undefined} />
              <Text className="text-muted">{t('looking', { code: state.code })}</Text>
            </View>
          ) : null}

          {state.step === 'none' ? (
            <View accessibilityLiveRegion="polite" className="gap-1">
              <Text variant="subheading">{t('none', { code: state.code })}</Text>
              <Text className="text-muted">{t('noneBody')}</Text>
            </View>
          ) : null}

          {state.step === 'failed' ? (
            <View accessibilityLiveRegion="polite" className="gap-3">
              <View className="gap-1">
                <Text variant="subheading">{t('failed', { code: state.code })}</Text>
                <Text className="text-muted">{describe(state.error)}</Text>
              </View>
              <Button label={common('retry')} icon="refresh" onPress={onRetry} />
            </View>
          ) : null}

          {state.step === 'many' ? (
            <View accessibilityLiveRegion="polite" className="gap-1">
              <Text variant="subheading">{t('many', { count: state.products.length })}</Text>
              <ScrollView className="max-h-60" keyboardShouldPersistTaps="handled">
                <RowGroup bare>
                  {state.products.map((product) => (
                    <ProductRow
                      key={product.id}
                      product={product}
                      onPress={() => onOpen(product, state.code)}
                      className="px-0"
                    />
                  ))}
                </RowGroup>
              </ScrollView>
            </View>
          ) : null}

          {scanAgain}

          <View className="flex-row items-end gap-2">
            <TextField
              label={t('manual')}
              value={typed}
              onChangeText={setTyped}
              onSubmitEditing={submit}
              editable={!looking}
              returnKeyType="search"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={64}
              className="flex-1"
              inputClassName="min-w-0"
            />
            <Button label={t('find')} disabled={looking || !codeOf(typed)} onPress={submit} />
          </View>
        </View>
      </FieldSurfaceProvider>
    </KeyboardStickyView>
  );
}
