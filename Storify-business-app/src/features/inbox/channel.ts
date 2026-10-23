import { useCallback } from 'react';
import { useTranslations } from 'use-intl';

import { storeWord } from '@/features/status/status-tone';

/** Channels the app has a name for; any other shows as the store wrote it. */
const KNOWN = [
  'web',
  'live_chat',
  'whatsapp',
  'messenger',
  'instagram',
  'telegram',
  'email',
  'sms',
] as const;

type KnownChannel = (typeof KNOWN)[number];

function known(channel: string): KnownChannel | null {
  const word = channel.trim().toLowerCase();
  return KNOWN.find((candidate) => candidate === word) ?? null;
}

/** The store's own live chat: a row says nothing about the channel then. */
export function isOwnChannel(channel: string): boolean {
  const word = known(channel);
  return word === 'web' || word === 'live_chat';
}

/** A conversation's channel in words: "WhatsApp", "Live chat". */
export function useChannelName(): (channel: string) => string {
  const t = useTranslations('inbox.channel');

  return useCallback(
    (channel) => {
      const word = known(channel);
      return word ? t(word) : storeWord(channel);
    },
    [t]
  );
}
