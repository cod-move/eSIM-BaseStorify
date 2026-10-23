import { router, useNavigation } from 'expo-router';
import { usePreventRemove, type NavigationAction } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { ConfirmSheet } from '@/components/ui/sheet';
/**
 * Leaving a return or refund form. `blocked` (something in flight: a request,
 * an upload) keeps the operator on it; a dirty draft asks before it is
 * discarded. An `unconfirmed` operation does not hold them: it stays, to be
 * checked when the form opens again, and the question says so.
 */
export function useReturnNavigation(
  dirty: boolean,
  blocked: boolean,
  discard: () => void,
  active: boolean,
  unconfirmed = false
) {
  const t = useTranslations('returns');
  const navigation = useNavigation();
  const [leave, setLeave] = useState<NavigationAction | 'header' | null>(null);
  const [allowed, setAllowed] = useState(false);
  const departure = useRef<(() => void) | null>(null);
  const exit = () => (router.canGoBack() ? router.back() : router.replace('/'));
  usePreventRemove(active && !allowed && (dirty || blocked), ({ data }) => setLeave(data.action));
  useEffect(() => {
    if (allowed && departure.current) {
      const go = departure.current;
      departure.current = null;
      go();
    }
  }, [allowed]);
  return {
    back: () => (dirty || blocked ? setLeave('header') : exit()),
    finish: (go: () => void) => {
      departure.current = go;
      setAllowed(true);
    },
    dialog: (
      <ConfirmSheet
        visible={Boolean(leave)}
        title={t('discardTitle')}
        body={t(blocked ? 'cannotDiscard' : unconfirmed ? 'discardUnconfirmed' : 'discardBody')}
        tone="danger"
        confirmLabel={t('discard')}
        cancelLabel={t('keepEditing')}
        confirmDisabled={blocked}
        onCancel={() => setLeave(null)}
        onConfirm={() => {
          if (blocked) return;
          discard();
          departure.current = () =>
            leave === 'header' ? exit() : leave && navigation.dispatch(leave);
          setAllowed(true);
          setLeave(null);
        }}
      />
    ),
  };
}
