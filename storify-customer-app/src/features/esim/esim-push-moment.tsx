import { getPermissionsAsync } from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useSession } from '@/features/auth/use-session';
import { pushPlatform } from '@/features/devices/use-push-registration';
import { usePushPermission } from '@/features/notifications/use-push-permission';
import { storage } from '@/lib/storage';

/** When My eSIMs last offered notifications on this phone (ms since epoch). */
const ASKED_AT_KEY = 'codsim.esim-push-asked-at';
/** How long after an offer My eSIMs offers again, while notifications stay off. */
export const ESIM_PUSH_ASK_EVERY_MS = 3 * 24 * 60 * 60 * 1000;

/** Whether My eSIMs offers again: never offered, or the last offer is old enough. */
export function esimPushDue(askedAt: string | null, now: number): boolean {
  const last = Number(askedAt);
  if (!askedAt || !Number.isFinite(last)) return true;
  return now - last >= ESIM_PUSH_ASK_EVERY_MS;
}

/**
 * On My eSIMs, offers notifications to a signed-in shopper who has them off:
 * activation, data running low and expiry reminders arrive by push. Unlike the
 * order screen's one-time offer, this one comes back every
 * ESIM_PUSH_ASK_EVERY_MS until notifications are on. When the phone will no
 * longer show its own prompt (the shopper refused it before), the button
 * opens the app's page in the phone's settings instead.
 */
export function EsimPushMoment() {
  const t = useTranslations('esim');
  const { isSignedIn } = useSession();
  const { state, request } = usePushPermission();
  // Read once, when the screen opens: this screen's own write below must not close its sheet.
  const [due] = useState(() => esimPushDue(storage.get(ASKED_AT_KEY), Date.now()));
  const [closed, setClosed] = useState(false);

  const open =
    due &&
    !closed &&
    isSignedIn &&
    pushPlatform() !== null &&
    (state === 'undetermined' || state === 'denied');

  useEffect(() => {
    if (open) storage.set(ASKED_AT_KEY, String(Date.now()));
  }, [open]);

  const allow = async () => {
    setClosed(true);
    const permission = await getPermissionsAsync().catch(() => null);
    if (permission && !permission.granted && !permission.canAskAgain) {
      await Linking.openSettings().catch(() => null);
      return;
    }
    await request();
  };

  return (
    <Sheet
      visible={open}
      title={t('pushTitle')}
      onClose={() => setClosed(true)}
      footer={
        <View className="gap-3">
          <Button label={t('pushAllow')} onPress={allow} />
          <Button label={t('pushLater')} variant="secondary" onPress={() => setClosed(true)} />
        </View>
      }>
      <View className="items-center gap-4">
        <Icon name="bell" size={40} colorClassName="accent-primary" />
        <Text className="text-center text-muted">{t('pushBody')}</Text>
      </View>
    </Sheet>
  );
}
