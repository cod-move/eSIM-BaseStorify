import { onlineManager } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { isApiError, isNetworkError } from '@/api/errors';
import { AlreadySending, AttemptAbandoned } from '@/api/keyed-mutation';
import { Banner } from '@/components/ui/banner';
import { Button, TextLink } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ConfirmSheet } from '@/components/ui/sheet';
import { InlineError, LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { CUSTOMER_NOTE_MAX_LENGTH, type CustomerNote } from '@/contracts/mobile/biz/v1';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useListTime } from '@/i18n/use-list-time';

import { useAddCustomerNote, useCustomerNotes } from './use-customers';

/**
 * The business's notes about a customer, for an
 * operator with `MANAGE_CUSTOMER_NOTES`; nothing at all without it. Drawn as
 * the inbox draws a team note (a `warning-soft` card with a lock), never as a
 * message: only the team sees them. "Add note" opens a sheet that writes one,
 * once per tap.
 */
export function CustomerNotes({ id }: { id: string }) {
  const t = useTranslations('customers.notes');
  const notes = useCustomerNotes(id);
  const [adding, setAdding] = useState(false);

  if (!notes.enabled) return null;

  const items = notes.data ?? [];
  const content = () => {
    if (notes.isPending) return <LoadingState shape="rows" rows={2} />;
    if (notes.isError && !notes.data) {
      return <InlineError error={notes.error} onRetry={() => void notes.refetch()} />;
    }
    if (items.length === 0) return <Text variant="meta">{t('empty')}</Text>;
    return (
      <View className="gap-2">
        {items.map((note) => (
          <NoteCard key={note.id} note={note} />
        ))}
        {notes.isFetchNextPageError ? (
          <InlineError error={notes.error} onRetry={() => void notes.fetchNextPage()} />
        ) : notes.hasNextPage ? (
          <TextLink
            label={t('more')}
            onPress={() => {
              if (!notes.isFetchingNextPage) void notes.fetchNextPage();
            }}
            className="self-center py-2"
          />
        ) : null}
      </View>
    );
  };

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-3 px-1 pt-2">
        <Text variant="heading" accessibilityRole="header" className="flex-1">
          {t('title')}
        </Text>
        <Button
          label={t('add')}
          icon="plus"
          variant="secondary"
          size="sm"
          onPress={() => setAdding(true)}
        />
      </View>
      <View className="flex-row items-center gap-1.5 px-1">
        <Icon name="lock" size={13} colorClassName="accent-muted" />
        <Text variant="caption" className="shrink">
          {t('internal')}
        </Text>
      </View>
      {content()}
      <AddNoteSheet id={id} visible={adding} onClose={() => setAdding(false)} />
    </View>
  );
}

/** One note: a lock and who wrote it, when, then the text, on the team's own colour. */
function NoteCard({ note }: { note: CustomerNote }) {
  const t = useTranslations('customers.notes');
  const roles = useTranslations('workspace.role');
  const common = useTranslations('common');
  const time = useListTime();
  const title = t('by', { name: note.author.name });
  const role = note.author.role ? roles(note.author.role) : null;
  const when = [role, time(note.createdAt)].filter(Boolean).join(common('separator'));

  return (
    <View
      accessible
      accessibilityLabel={[title, t('hint'), when, note.body].join(', ')}
      className="gap-1.5 rounded-[20px] bg-warning-soft px-4 py-3">
      <View className="flex-row items-center gap-1.5">
        <Icon name="lock" size={14} colorClassName="accent-warning" />
        <Text variant="label" className="shrink">
          {title}
        </Text>
      </View>
      <Text variant="long" selectable>
        {note.body}
      </Text>
      <Text variant="caption">{when}</Text>
    </View>
  );
}

type AddNoteSheetProps = { id: string; visible: boolean; onClose: () => void };

/**
 * A failure after which the note may be stored already: no answer at all, the
 * store failing (5xx), or the same key still in progress. Only the same note
 * may go again then, with the same key; a refusal before the store looked at
 * the key (401, 403, 429) or a final one stored nothing, so the text can change.
 */
function mayBeSaved(error: unknown): boolean {
  return (
    isNetworkError(error) ||
    (isApiError(error) && (error.status >= 500 || error.code === 'REQUEST_IN_PROGRESS'))
  );
}

/**
 * Writes a note: the text (2000 characters at most), then Save. A tap goes
 * with one `Idempotency-Key`, kept for "Try again" while the note may be
 * saved already, so it is saved once; the text is locked meanwhile, and stays
 * when the sheet is closed and opened again. Offline, nothing is sent and the
 * text stays.
 */
function AddNoteSheet({ id, visible, onClose }: AddNoteSheetProps) {
  const t = useTranslations('customers.notes');
  const common = useTranslations('common');
  const toast = useToast();
  const describe = useErrorMessage();
  const add = useAddCustomerNote(id);
  const [body, setBody] = useState('');
  // No answer to the last tap: only the same note may be sent again.
  const [unanswered, setUnanswered] = useState(false);
  const [wasVisible, setWasVisible] = useState(visible);

  // A note that may be saved already is kept, locked, for its "Try again".
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible && !unanswered) setBody('');
  }

  const text = body.trim();
  const locked = unanswered || add.isPending;

  async function save() {
    if (!text) return;
    const online = onlineManager.isOnline();
    try {
      await add.submit({ body: text });
      setUnanswered(false);
      setBody('');
      toast.show({ message: t('saved'), tone: 'success' });
      onClose();
    } catch (error) {
      if (error instanceof AlreadySending || error instanceof AttemptAbandoned) return;
      if (isNetworkError(error) && !online && !unanswered) {
        toast.show({ message: common('notSentOffline'), tone: 'offline' });
      } else if (mayBeSaved(error)) {
        setUnanswered(true);
      } else {
        setUnanswered(false);
        toast.show({ message: describe(error), tone: 'danger' });
      }
    }
  }

  return (
    <ConfirmSheet
      visible={visible}
      title={t('sheetTitle')}
      body={t('hint')}
      confirmLabel={unanswered ? common('retry') : t('save')}
      cancelLabel={t('cancel')}
      onConfirm={() => void save()}
      onCancel={onClose}
      loading={add.isPending}
      confirmDisabled={!text}>
      <View className="gap-3">
        {unanswered ? <Banner tone="warning" message={t('noAnswer')} /> : null}
        <TextField
          label={t('field')}
          value={body}
          onChangeText={setBody}
          editable={!locked}
          multiline
          maxLength={CUSTOMER_NOTE_MAX_LENGTH}
          hint={t('count', { count: body.length, max: CUSTOMER_NOTE_MAX_LENGTH })}
        />
      </View>
    </ConfirmSheet>
  );
}
