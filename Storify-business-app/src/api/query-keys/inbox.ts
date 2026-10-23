import type { ConversationListQuery } from '@/contracts/mobile/biz/v1';

import type { WorkspaceScope } from '../scope';
import { inWorkspace } from './shared';

type ConversationFilter = Omit<ConversationListQuery, 'cursor' | 'limit'>;

export const inboxKeys = {
  /** Shares inbox invalidation, but never its infinite-list cache shape. */
  homeConversations: (scope: WorkspaceScope | null) =>
    [...inWorkspace(scope, 'inbox'), 'list', 'home-preview', scope?.locale] as const,
  /** Every conversation list of the workspace, whatever the filter and language. */
  conversationLists: (scope: WorkspaceScope | null) =>
    [...inWorkspace(scope, 'inbox'), 'list'] as const,
  conversationList: (scope: WorkspaceScope | null, filter: ConversationFilter) =>
    [...inWorkspace(scope, 'inbox'), 'list', scope?.locale, filter] as const,
  /** One conversation's messages, newest first, a page at a time. */
  conversationMessages: (scope: WorkspaceScope | null, id: string) =>
    [...inWorkspace(scope, 'inbox'), 'messages', id, scope?.locale] as const,
  /** Who one conversation may be given to. */
  conversationAssignees: (scope: WorkspaceScope | null, id: string) =>
    [...inWorkspace(scope, 'inbox'), 'assignees', id, scope?.locale] as const,
};
