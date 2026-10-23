import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Avatar } from '@/components/ui/avatar';
import { IconCircle } from '@/components/ui/icon-circle';
import { RadioRow, RowGroup } from '@/components/ui/rows';
import { SearchField } from '@/components/ui/search-field';
import { Sheet } from '@/components/ui/sheet';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import type { Conversation } from '@/contracts/mobile/biz/v1';
import { storeWord } from '@/features/status/status-tone';

import { useConversationAssignees } from './use-inbox';

const ROLES = ['admin', 'staff', 'vendor'] as const;

/** A team member's part in the store's words: "Administrator", "Staff", "Seller"; the store's own word otherwise. */
function useRoleWord(): (role: string) => string {
  const t = useTranslations('inbox.team.roles');
  return (role) => {
    const known = ROLES.find((candidate) => candidate === role);
    return known ? t(known) : storeWord(role);
  };
}

type AssignSheetProps = {
  visible: boolean;
  conversation: Conversation;
  /** The operator's own account id (GET /me): "Assign to me" and "(you)". */
  me: string | undefined;
  /** Someone in the team (and their name), or nobody (`null`); called only for a change. */
  onChoose: (assigneeId: string | null, name?: string) => void;
  onClose: () => void;
};

/**
 * Who the conversation goes to (the `assign` action), in a bottom sheet:
 * "Assign to me" and "Unassigned" first, then the team the store lists for it
 * (GET …/assignees), found by a search over names and emails. The current one
 * is checked; choosing one closes the sheet.
 */
export function AssignSheet({ visible, conversation, me, onChoose, onClose }: AssignSheetProps) {
  const t = useTranslations('inbox.team');
  const common = useTranslations('common');
  const roleWord = useRoleWord();
  const [search, setSearch] = useState('');
  const assignees = useConversationAssignees(conversation.id, { enabled: visible });
  const term = search.trim().toLowerCase();
  const current = conversation.assignee?.id ?? null;
  const items = (assignees.data?.items ?? []).filter(
    (person) =>
      !term ||
      person.name.toLowerCase().includes(term) ||
      Boolean(person.email?.toLowerCase().includes(term))
  );

  const close = () => {
    onClose();
    setSearch('');
  };
  const choose = (assigneeId: string | null, name?: string) => {
    close();
    if (assigneeId !== current) onChoose(assigneeId, name);
  };

  const team = () => {
    if (assignees.isPending) return <LoadingState shape="rows" />;
    if (assignees.isError) {
      return <ErrorState error={assignees.error} onRetry={() => void assignees.refetch()} />;
    }
    if (items.length === 0) {
      return (
        <EmptyState
          icon="users"
          placement="top"
          title={term ? t('noMatch') : t('noTeam')}
          body={term ? t('noMatchBody', { search: search.trim() }) : undefined}
        />
      );
    }
    return items.map((person) => (
      <RadioRow
        key={person.id}
        title={person.id === me ? t('you', { name: person.name }) : person.name}
        description={[roleWord(person.role), person.email]
          .filter(Boolean)
          .join(common('separator'))}
        leading={<Avatar name={person.name} imageUrl={person.imageUrl} size="sm" />}
        selected={person.id === current}
        onSelect={() => choose(person.id, person.name)}
        className="px-0"
      />
    ));
  };

  return (
    <Sheet visible={visible} title={t('sheetTitle')} onClose={close}>
      <View className="gap-3">
        <SearchField label={t('search')} value={search} onChangeText={setSearch} />
        <RowGroup bare divider="leading" accessibilityRole="radiogroup">
          {!term && me && current !== me ? (
            <RadioRow
              title={t('assignToMe')}
              leading={<IconCircle icon="user" tone="info" size="sm" />}
              selected={false}
              onSelect={() => choose(me)}
              className="px-0"
            />
          ) : null}
          {!term ? (
            <RadioRow
              title={t('nobody')}
              leading={<IconCircle icon="users" tone="neutral" size="sm" />}
              selected={current === null}
              onSelect={() => choose(null)}
              className="px-0"
            />
          ) : null}
          {team()}
        </RowGroup>
      </View>
    </Sheet>
  );
}
