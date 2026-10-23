import type { Conversation } from '@/contracts/mobile/biz/v1';
import { useConfig } from '@/features/config/use-config';
import { useWorkspace } from '@/features/workspace/use-workspace';

import type { ThreadContact } from './message-bubble';

/**
 * Who answers for the store, as the customer sees it beside the replies (the
 * shopper app pictures the store by its square mark and a seller by their
 * logo): in a seller's workspace, the seller's logo; in a seller's
 * conversation read by the store's operators, the seller's name; otherwise
 * the store's square mark (its logo without one) and name. The name above a
 * run still says who in the team wrote it.
 */
export function useTeamPicture(conversation: Conversation | undefined): ThreadContact {
  const workspace = useWorkspace();
  const store = useConfig().data?.store;
  const vendor = workspace.status === 'ready' ? workspace.access.vendor : undefined;
  if (vendor) {
    return { name: vendor.name, ...(vendor.logo ? { imageUrl: vendor.logo.thumb } : {}) };
  }
  if (conversation?.vendorName) return { name: conversation.vendorName };
  const mark = store?.icon ?? store?.logo;
  return { name: store?.name ?? '', ...(mark ? { imageUrl: mark.thumb } : {}) };
}
