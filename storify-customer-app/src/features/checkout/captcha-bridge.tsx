import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useTranslations } from 'use-intl';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import type { CheckoutCaptcha } from '@/contracts/mobile/shop/v1';

/**
 * The store's human check (`CheckoutCaptcha`). When a quote asks for one, the
 * store's page is shown in a web view and posts its outcome to the app. The
 * page is the store's, and so is what it sends: every message is parsed, and
 * dropped unless it carries the nonce this check was opened with.
 */

/** Whether the order may not be placed yet: the quote asks for a check and none has been passed. */
export function needsCaptchaToken(
  captcha: Pick<CheckoutCaptcha, 'required'>,
  token: string | undefined
): boolean {
  return captcha.required && !token;
}

/** The store's page with the nonce this check will be answered with. */
export function captchaUrl(url: string, nonce: string): string {
  const [page = url] = url.split('#');
  return `${page}${page.includes('?') ? '&' : '?'}nonce=${encodeURIComponent(nonce)}`;
}

/** The longest token the store accepts (`PlaceOrderRequest.turnstileToken`). */
const MAX_TOKEN_LENGTH = 4000;

const Message = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('turnstile'),
    nonce: z.string(),
    token: z.string().min(1).max(MAX_TOKEN_LENGTH),
  }),
  z.object({ type: z.literal('turnstile-expired'), nonce: z.string() }),
  z.object({ type: z.literal('turnstile-error'), nonce: z.string() }),
  z.object({ type: z.literal('turnstile-unavailable'), nonce: z.string() }),
]);

export type CaptchaOutcome =
  { kind: 'token'; token: string } | { kind: 'expired' } | { kind: 'failed' };

/**
 * What a message from the page means, or `undefined` for anything that is not
 * a well-formed message of this check. A store with no check
 * (`turnstile-unavailable`) cannot give a token, so it counts as a failure.
 */
export function parseCaptchaMessage(data: string, nonce: string): CaptchaOutcome | undefined {
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    return undefined;
  }
  const parsed = Message.safeParse(json);
  if (!parsed.success || parsed.data.nonce !== nonce) return undefined;

  switch (parsed.data.type) {
    case 'turnstile':
      return { kind: 'token', token: parsed.data.token };
    case 'turnstile-expired':
      return { kind: 'expired' };
    default:
      return { kind: 'failed' };
  }
}

/** The page's own height: the widget is a bar, and grows when it needs the shopper. */
const FRAME_HEIGHT = 220;

type CaptchaSheetProps = {
  visible: boolean;
  onClose: () => void;
  captcha: CheckoutCaptcha;
  /** The token, good once and for a few minutes; `undefined` when it has lapsed. */
  onToken: (token: string | undefined) => void;
};

/** The security check in a sheet. It closes itself once the store has given its token. */
function CaptchaSheet({ visible, onClose, captcha, onToken }: CaptchaSheetProps) {
  const t = useTranslations('coupons.captcha');

  return (
    <Sheet visible={visible} title={t('title')} onClose={onClose}>
      {captcha.url ? (
        <CaptchaFrame url={captcha.url} onToken={onToken} onClose={onClose} />
      ) : (
        <Text variant="caption" className="text-danger">
          {t('error')}
        </Text>
      )}
    </Sheet>
  );
}

type CaptchaGateProps = {
  captcha: CheckoutCaptcha;
  /** The token in hand, if any. */
  token: string | undefined;
  onToken: (token: string | undefined) => void;
};

/**
 * What checkout shows for the human check: nothing while the store does not
 * ask for one or the token is in hand; otherwise a row saying so, with the
 * check opening on its own the first time it is asked for.
 */
export function CaptchaGate({ captcha, token, onToken }: CaptchaGateProps) {
  const t = useTranslations('coupons.captcha');
  const [open, setOpen] = useState(false);
  const [offered, setOffered] = useState(false);
  const needed = needsCaptchaToken(captcha, token);

  if (needed && !offered) {
    setOffered(true);
    setOpen(true);
  }

  return (
    <>
      {needed ? (
        <View className="flex-row items-center gap-3 rounded-2xl bg-surface p-4">
          <Icon name="shield" size={22} />
          <Text variant="body" className="flex-1">
            {t('required')}
          </Text>
          <Button label={t('start')} variant="outline" size="sm" onPress={() => setOpen(true)} />
        </View>
      ) : null}
      <CaptchaSheet
        visible={open}
        onClose={() => setOpen(false)}
        captcha={captcha}
        onToken={onToken}
      />
    </>
  );
}

type CaptchaFrameProps = {
  url: string;
  onToken: (token: string | undefined) => void;
  onClose: () => void;
};

function CaptchaFrame({ url, onToken, onClose }: CaptchaFrameProps) {
  const t = useTranslations('coupons.captcha');
  // A new nonce for every attempt: a message of an earlier one is not this check's.
  const [attempt, setAttempt] = useState(() => ({ nonce: randomUUID(), count: 0 }));
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [expired, setExpired] = useState(false);
  const origin = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i.exec(url)?.[0];

  const receive = (event: WebViewMessageEvent) => {
    // Only the store's own page speaks for the check.
    if (origin && !event.nativeEvent.url.startsWith(origin)) return;
    const outcome = parseCaptchaMessage(event.nativeEvent.data, attempt.nonce);
    if (!outcome) return;

    if (outcome.kind === 'token') {
      onToken(outcome.token);
      onClose();
    } else if (outcome.kind === 'expired') {
      // The page shows a new check by itself.
      onToken(undefined);
      setExpired(true);
    } else {
      setFailed(true);
    }
  };

  const retry = () => {
    setFailed(false);
    setExpired(false);
    setLoading(true);
    setAttempt((last) => ({ nonce: randomUUID(), count: last.count + 1 }));
  };

  if (failed) {
    return (
      <View className="items-center gap-3 py-4">
        <Text variant="body" className="text-center text-danger" accessibilityRole="alert">
          {t('error')}
        </Text>
        <Button label={t('retry')} variant="secondary" onPress={retry} />
      </View>
    );
  }

  return (
    <View className="gap-2">
      <View style={{ height: FRAME_HEIGHT }} className="overflow-hidden rounded-lg bg-surface">
        <WebView
          key={attempt.count}
          source={{ uri: captchaUrl(url, attempt.nonce) }}
          onMessage={receive}
          onLoadEnd={() => setLoading(false)}
          onError={() => setFailed(true)}
          onHttpError={() => setFailed(true)}
          accessibilityLabel={t('title')}
          javaScriptEnabled
          style={{ backgroundColor: 'transparent' }}
        />
        {loading ? (
          <View className="absolute inset-0 justify-center p-4" accessibilityLabel={t('loading')}>
            <Skeleton className="h-16 w-full rounded-lg" />
          </View>
        ) : null}
      </View>
      {expired ? (
        <Text variant="caption" accessibilityRole="alert">
          {t('expired')}
        </Text>
      ) : null}
    </View>
  );
}
