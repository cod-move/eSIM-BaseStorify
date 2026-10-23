import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { ChoiceChips } from '@/components/ui/form-sections';
import { Sheet } from '@/components/ui/sheet';
import { CONVERSATION_ASSIGNEE_FILTERS, CONVERSATION_STATUSES } from '@/contracts/mobile/biz/v1';

export type InboxFilter = {
  unread: boolean;
  status: (typeof CONVERSATION_STATUSES)[number] | null;
  /** The operator's own (`me`), or nobody's yet (`none`). */
  assignee: (typeof CONVERSATION_ASSIGNEE_FILTERS)[number] | null;
};

export const NO_FILTER: InboxFilter = { unread: false, status: null, assignee: null };

/** How many filters are on: the count on the filter button. */
export function filterCount(filter: InboxFilter): number {
  return (filter.unread ? 1 : 0) + (filter.status ? 1 : 0) + (filter.assignee ? 1 : 0);
}

/**
 * The inbox's filters in a bottom sheet, as the shopper app's filter sheet:
 * a group of option chips each for what to show, who has it and the status,
 * then Reset and Apply. Nothing changes until Apply.
 */
export function InboxFilterSheet({
  visible,
  value,
  onApply,
  onClose,
}: {
  visible: boolean;
  value: InboxFilter;
  onApply: (filter: InboxFilter) => void;
  onClose: () => void;
}) {
  const t = useTranslations('inbox.filters');
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(visible);
  // Opening the sheet starts from what is applied.
  if (visible !== shown) {
    setShown(visible);
    if (visible) setDraft(value);
  }
  return (
    <Sheet
      visible={visible}
      title={t('title')}
      onClose={onClose}
      footer={
        <View className="flex-row gap-3">
          <Button
            label={t('reset')}
            variant="secondary"
            className="flex-1"
            onPress={() => setDraft(NO_FILTER)}
          />
          <Button
            label={t('apply')}
            className="flex-1"
            onPress={() => {
              onApply(draft);
              onClose();
            }}
          />
        </View>
      }>
      <View className="gap-6 pb-2">
        <ChoiceChips
          label={t('show')}
          value={draft.unread ? 'unread' : 'all'}
          choices={[
            { value: 'all', label: t('all') },
            { value: 'unread', label: t('unread') },
          ]}
          onChange={(show) => setDraft({ ...draft, unread: show === 'unread' })}
        />
        <ChoiceChips
          label={t('assignee')}
          value={draft.assignee ?? 'anyone'}
          choices={[
            { value: 'anyone', label: t('anyone') },
            { value: 'me', label: t('mine') },
            { value: 'none', label: t('unassigned') },
          ]}
          onChange={(assignee) =>
            setDraft({ ...draft, assignee: assignee === 'anyone' ? null : assignee })
          }
        />
        <ChoiceChips
          label={t('status')}
          value={draft.status ?? 'any'}
          choices={[
            { value: 'any', label: t('anyStatus') },
            ...CONVERSATION_STATUSES.map((status) => ({ value: status, label: t(status) })),
          ]}
          onChange={(status) => setDraft({ ...draft, status: status === 'any' ? null : status })}
        />
      </View>
    </Sheet>
  );
}
