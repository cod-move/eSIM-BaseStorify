/**
 * The inbox: conversations, their messages, replying (keyed), marking read;
 * the team's notes (keyed), who has a conversation, resolving and reopening.
 * The store's operators see the store's own conversations; a seller and their
 * staff see the seller's.
 */
import {
  CONVERSATION_ASSIGNEE_FILTERS,
  CONVERSATION_STATUS_CHANGES,
  CONVERSATION_STATUSES,
  type AttachmentPolicy,
  type Conversation,
  type ConversationAction,
  type ConversationAssignees,
  type ConversationMessage,
  type MessageProduct,
} from '@/contracts/mobile/biz/v1';

import type { MockAccount, MockGrant } from '../fixtures/accounts';
import { ACCOUNTS, VENDORS } from '../fixtures/accounts';
import { customerByEmail, customerById } from '../fixtures/customers';
import { seedConversations, type MockConversation } from '../fixtures/inbox';
import { seedProducts } from '../fixtures/products';
import { flag, image, money, notFound, oneOf, pageOf, searchOf, textOf } from '../fixtures/shared';
import {
  MockError,
  accountOf,
  bodyOf,
  grantOf,
  invalid,
  type MockContext,
  type MockRoute,
} from '../kit';
import { isMockMultipartFile } from '../multipart';
import { scopeOf, type MockScope } from '../scope';

import { customerOrders } from './orders';

let conversations = seedConversations();
const products = new Map(seedProducts().map((product) => [product.id, product]));
/** The largest file the app's upload carries, as the store caps it. */
const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
/** The files each channel takes from the app, as the store's channel table lists them. */
const CHANNEL_FILES: Record<string, string[]> = {
  web: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'application/pdf'],
  whatsapp: ['image/jpeg', 'image/png', 'video/mp4', 'application/pdf'],
  messenger: ['image/jpeg', 'image/png', 'image/gif'],
};
/** Conversation → the reason its next reply is refused with (`refuseNextReply`). */
const refusals = new Map<string, string>();

export function reset(): void {
  conversations = seedConversations();
  refusals.clear();
}

/** The conversations in reach, the most recent first (the customers' area reads them too). */
export function conversationsInScope(scope: MockScope): MockConversation[] {
  return inScope(scope);
}

function inScope(scope: MockScope): MockConversation[] {
  return conversations
    .filter((conversation) =>
      scope.kind === 'store' ? !conversation.vendorId : conversation.vendorId === scope.vendorId
    )
    .sort((a, b) => lastAt(b).localeCompare(lastAt(a)));
}

/** The newest message the customer sees too: a note moves nothing a list shows. */
function lastShown(conversation: MockConversation): ConversationMessage | undefined {
  return [...conversation.messages].reverse().find((message) => message.direction !== 'internal');
}

function lastAt(conversation: MockConversation): string {
  return lastShown(conversation)?.createdAt ?? conversation.createdAt;
}

/** Unread customer messages in every conversation in reach: the tab's badge and Home's tile. */
export function unreadTotal(scope: MockScope): number {
  return inScope(scope).reduce((total, conversation) => total + conversation.unreadCount, 0);
}

function conversationOf(ctx: MockContext, id: string): MockConversation {
  const found = inScope(scopeOf(grantOf(ctx))).find((candidate) => candidate.id === id);
  if (!found) throw notFound('Conversation');
  return found;
}

function windowOpen(conversation: MockConversation): boolean {
  return (
    !conversation.replyWindowEndsAt || conversation.replyWindowEndsAt > new Date().toISOString()
  );
}

function takesReplies(conversation: MockConversation): boolean {
  return conversation.status !== 'closed' && conversation.status !== 'spam';
}

function policyOf(conversation: MockConversation): AttachmentPolicy | undefined {
  const types = CHANNEL_FILES[conversation.channel];
  if (!types) return undefined;
  return {
    maxFiles: 1,
    types: types.map((mimeType) => ({ mimeType, maxBytes: UPLOAD_MAX_BYTES })),
  };
}

/**
 * Who it is with, among the operator's customers, for one who may see them: an
 * account (who wrote signed in), or a guest the store keeps a record for and
 * who ordered within the operator's reach.
 */
function customerIdOf(conversation: MockConversation, grant: MockGrant): string | undefined {
  if (!grant.capabilities.includes('VIEW_ORDER_CUSTOMERS')) return undefined;
  const customer = customerByEmail(conversation.contact.email);
  if (!customer) return undefined;
  const scope = scopeOf(grant);
  if (customer.kind === 'account' || scope.kind === 'store') return customer.id;
  return customerOrders(scope, customer).length > 0 ? customer.id : undefined;
}

/**
 * Who in the team may have a conversation, as the store lists them: whoever
 * works in its workspace (the store's, or its seller's) with the inbox.
 */
function teamOf(conversation: MockConversation): MockAccount[] {
  return ACCOUNTS.filter((account) =>
    account.grants.some(
      (grant) =>
        grant.capabilities.includes('VIEW_INBOX') &&
        (conversation.vendorId
          ? grant.workspace === 'vendor' && grant.vendorId === conversation.vendorId
          : grant.workspace === 'platform' && !grant.scoped)
    )
  );
}

/** The store's rule for what an operator may do to a conversation besides replying. */
function actionsOf(
  conversation: MockConversation,
  grant: MockGrant,
  accountId: string
): ConversationAction[] {
  const mayReply = grant.capabilities.includes('REPLY_INBOX');
  const mayManage = grant.capabilities.includes('MANAGE_INBOX');
  const actions: ConversationAction[] = [];
  if (mayReply) actions.push('note');
  if (mayManage) actions.push('assign');
  if (mayReply && conversation.assigneeId !== accountId) actions.push('claim');
  if (mayManage && (conversation.status === 'open' || conversation.status === 'pending')) {
    actions.push('resolve');
  }
  if (mayManage && conversation.status === 'resolved') actions.push('reopen');
  return actions;
}

function viewOf(conversation: MockConversation, ctx: MockContext): Conversation {
  const grant = grantOf(ctx);
  const last = lastShown(conversation);
  const assignee = ACCOUNTS.find((account) => account.id === conversation.assigneeId);
  const product = conversation.productId ? products.get(conversation.productId) : undefined;
  const vendor =
    grant.workspace === 'platform' && conversation.vendorId
      ? VENDORS[conversation.vendorId]
      : undefined;
  const canReply =
    takesReplies(conversation) &&
    windowOpen(conversation) &&
    grant.capabilities.includes('REPLY_INBOX');
  const policy = canReply ? policyOf(conversation) : undefined;
  const customerId = customerIdOf(conversation, grant);
  return {
    id: conversation.id,
    channel: conversation.channel,
    subject: conversation.subject,
    status: conversation.status,
    contact: conversation.contact,
    ...(customerId ? { customerId } : {}),
    ...(product
      ? {
          product: {
            id: product.id,
            name: product.name,
            ...(product.pictures[0] ? { image: image(product.pictures[0], product.name) } : {}),
          },
        }
      : {}),
    ...(vendor ? { vendorName: vendor.name } : {}),
    ...(assignee
      ? {
          assignedTo: assignee.name,
          assignee: {
            id: assignee.id,
            name: assignee.name,
            ...(assignee.imageUrl ? { imageUrl: assignee.imageUrl } : {}),
          },
        }
      : {}),
    actions: actionsOf(conversation, grant, accountOf(ctx).id),
    lastMessagePreview: last?.body ?? '',
    lastMessageAt: lastAt(conversation),
    unreadCount: conversation.unreadCount,
    canReply,
    ...(policy ? { attachments: policy } : {}),
    ...(conversation.replyWindowEndsAt
      ? { replyWindowEndsAt: conversation.replyWindowEndsAt }
      : {}),
    createdAt: conversation.createdAt,
  };
}

/** What a reply meets before it is kept: a refusal asked for, a closed conversation, a closed window. */
function refuseReply(conversation: MockConversation) {
  const refusal = refusals.get(conversation.id);
  if (refusal) {
    refusals.delete(conversation.id);
    throw new MockError(409, 'CONFLICT', 'The store refused this reply', { reason: refusal });
  }
  if (!takesReplies(conversation)) {
    throw new MockError(409, 'CONFLICT', 'This conversation is closed', {
      reason: 'CONVERSATION_CLOSED',
    });
  }
  if (!windowOpen(conversation)) {
    throw new MockError(
      409,
      'CONFLICT',
      'The reply window has closed; send a template from the website',
      {
        reason: 'REPLY_WINDOW_CLOSED',
      }
    );
  }
}

/** A product the customer can open, as the message keeps it: in a seller's conversation, one of theirs. */
function productOf(ctx: MockContext, conversation: MockConversation, id: string): MessageProduct {
  const product = products.get(id);
  if (
    !product ||
    product.status !== 'active' ||
    (conversation.vendorId && product.vendorId !== conversation.vendorId)
  ) {
    throw new MockError(409, 'CONFLICT', 'This product cannot be shared here', {
      reason: 'PRODUCT_NOT_AVAILABLE',
    });
  }
  return {
    id: product.id,
    name: product.name,
    ...(product.pictures[0] ? { image: image(product.pictures[0], product.name) } : {}),
    ...(product.price !== undefined && !product.priceOnRequest
      ? { price: money(product.price, ctx.locale) }
      : {}),
  };
}

function keep(
  ctx: MockContext,
  conversation: MockConversation,
  fields: Partial<ConversationMessage>
) {
  const grant = grantOf(ctx);
  const sent: ConversationMessage = {
    id: `msg_${Date.now().toString(36)}_${conversation.messages.length}`,
    direction: 'outbound',
    senderType: grant.role,
    senderName: accountOf(ctx).name,
    senderId: accountOf(ctx).id,
    body: '',
    attachments: [],
    deliveryStatus: 'sent',
    createdAt: new Date().toISOString(),
    ...fields,
  };
  conversation.messages.push(sent);
  return { message: sent, conversation: viewOf(conversation, ctx) };
}

/** A note for the team: kept in the thread as `internal`, whatever its status or window. */
function note(ctx: MockContext, conversation: MockConversation) {
  const body = (textOf(bodyOf(ctx), 'body') ?? '').trim();
  if (!body || body.length > 4000) throw invalid('body', 'Write a note of 1 to 4000 characters.');
  return keep(ctx, conversation, { direction: 'internal', body });
}

function forbidden(): MockError {
  return new MockError(403, 'AUTHORIZATION_ERROR', 'You do not have permission to do this.');
}

/** Gives the conversation to someone in its team, to the operator, or to nobody (`null`). */
function assign(ctx: MockContext, conversation: MockConversation) {
  const { assigneeId } = bodyOf(ctx);
  if (assigneeId !== null && (typeof assigneeId !== 'string' || !assigneeId.trim())) {
    throw invalid('assigneeId', 'Say who, or null for nobody.');
  }
  const wanted = assigneeId === null ? null : assigneeId.trim();
  const me = accountOf(ctx).id;
  const current = conversation.assigneeId ?? null;
  const offered = actionsOf(conversation, grantOf(ctx), me);
  const allowed =
    wanted === me
      ? offered.includes('claim') || offered.includes('assign') || current === me
      : offered.includes('assign');
  if (!allowed) throw forbidden();
  if (wanted !== current) {
    if (wanted !== null && !teamOf(conversation).some((account) => account.id === wanted)) {
      throw new MockError(409, 'CONFLICT', 'That person cannot take this conversation', {
        reason: 'ASSIGNEE_NOT_AVAILABLE',
      });
    }
    if (wanted === null) delete conversation.assigneeId;
    else conversation.assigneeId = wanted;
  }
  return viewOf(conversation, ctx);
}

/** Resolves it (from open or pending), or opens it again (from resolved). */
function changeStatus(ctx: MockContext, conversation: MockConversation) {
  const asked = textOf(bodyOf(ctx), 'status');
  const status = CONVERSATION_STATUS_CHANGES.find((candidate) => candidate === asked);
  if (!status) throw invalid('status', 'Send resolved or open.');
  const already =
    status === 'resolved'
      ? conversation.status === 'resolved'
      : conversation.status === 'open' || conversation.status === 'pending';
  if (!already) {
    const step = status === 'resolved' ? 'resolve' : 'reopen';
    if (!actionsOf(conversation, grantOf(ctx), accountOf(ctx).id).includes(step)) {
      throw new MockError(409, 'CONFLICT', 'This conversation cannot take that step now.', {
        reason: 'STATUS_CHANGE_NOT_ALLOWED',
        details: { status: conversation.status },
      });
    }
    conversation.status = status;
  }
  return viewOf(conversation, ctx);
}

function reply(ctx: MockContext, conversation: MockConversation) {
  const request = bodyOf(ctx);
  const body = textOf(request, 'body') ?? '';
  const productId = textOf(request, 'productId');
  if ((!body && !productId) || body.length > 4000) {
    throw invalid('body', 'Write a message or share a product.');
  }
  refuseReply(conversation);
  if (!productId) return keep(ctx, conversation, { body });
  const product = productOf(ctx, conversation, productId);
  return keep(ctx, conversation, {
    body: body || `${product.name}\nhttps://mock.storify.invalid/products/${product.id}`,
    product,
    ...(body ? {} : { bodyIsFallback: true }),
  });
}

/** One file sent into a conversation, with text if any: only what its channel takes. */
function attach(ctx: MockContext, conversation: MockConversation) {
  const request = bodyOf(ctx);
  const file = request.file;
  if (!isMockMultipartFile(file)) throw invalid('file', 'Choose one file to send');
  const body = textOf(request, 'body') ?? '';
  if (body.length > 4000) throw invalid('body', 'Write up to 4000 characters');
  refuseReply(conversation);
  const mimeType = (file.mimeType.split(';')[0] ?? '').trim().toLowerCase();
  const allowed = policyOf(conversation)?.types.find((type) => type.mimeType === mimeType);
  if (!allowed || file.size <= 0 || file.size > allowed.maxBytes) {
    throw new MockError(400, 'VALIDATION_ERROR', 'This conversation does not take this file', {
      reason: 'ATTACHMENT_NOT_ACCEPTED',
    });
  }
  const type = mimeType.startsWith('image/')
    ? 'image'
    : mimeType.startsWith('video/')
      ? 'video'
      : 'document';
  return keep(ctx, conversation, {
    body,
    attachments: [
      {
        type,
        url: `https://mock.storify.invalid/chat/${encodeURIComponent(file.filename)}`,
        name: file.filename,
        mimeType,
        size: file.size,
      },
    ],
  });
}

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/conversations',
    access: { capability: 'VIEW_INBOX' },
    handle: (ctx) => {
      const grant = grantOf(ctx);
      const scope = scopeOf(grant);
      const status = oneOf(ctx.query, 'status', CONVERSATION_STATUSES);
      const search = searchOf(ctx.query);
      const customerId = ctx.query.get('customerId');
      const assignee = oneOf(ctx.query, 'assignee', CONVERSATION_ASSIGNEE_FILTERS);
      const me = accountOf(ctx).id;
      // One customer's: those under their email; nobody's for an unknown id.
      const customer = customerId ? customerById(customerId) : undefined;
      const rows = inScope(scope).filter(
        (conversation) =>
          (!customerId || (customer && conversation.contact.email === customer.email)) &&
          (!assignee ||
            (assignee === 'me' ? conversation.assigneeId === me : !conversation.assigneeId)) &&
          (!status || conversation.status === status) &&
          (!flag(ctx.query, 'unreadOnly') || conversation.unreadCount > 0) &&
          (!search ||
            [
              conversation.contact.name,
              conversation.contact.email,
              conversation.contact.phone,
              conversation.subject,
            ].some((field) => field?.toLowerCase().includes(search)))
      );
      const page = pageOf(rows, ctx.query);
      return {
        ...page,
        items: page.items.map((conversation) => viewOf(conversation, ctx)),
        unreadCount: unreadTotal(scope),
      };
    },
  },
  {
    method: 'GET',
    path: /^\/conversations\/([^/]+)\/messages$/,
    access: { capability: 'VIEW_INBOX' },
    handle: (ctx, [id = '']) => {
      const conversation = conversationOf(ctx, id);
      const newestFirst = [...conversation.messages].reverse();
      return {
        ...pageOf(newestFirst, ctx.query),
        conversation: viewOf(conversation, ctx),
      };
    },
  },
  {
    method: 'POST',
    path: /^\/conversations\/([^/]+)\/messages$/,
    access: { capability: 'REPLY_INBOX' },
    idempotent: true,
    handle: (ctx, [id = '']) => reply(ctx, conversationOf(ctx, id)),
  },
  {
    method: 'POST',
    path: /^\/conversations\/([^/]+)\/attachments$/,
    access: { capability: 'REPLY_INBOX' },
    idempotent: true,
    handle: (ctx, [id = '']) => attach(ctx, conversationOf(ctx, id)),
  },
  {
    method: 'POST',
    path: /^\/conversations\/([^/]+)\/notes$/,
    access: { capability: 'REPLY_INBOX' },
    idempotent: true,
    handle: (ctx, [id = '']) => note(ctx, conversationOf(ctx, id)),
  },
  {
    method: 'GET',
    path: /^\/conversations\/([^/]+)\/assignees$/,
    access: { capability: 'MANAGE_INBOX' },
    handle: (ctx, [id = '']): ConversationAssignees => ({
      items: teamOf(conversationOf(ctx, id)).map((account) => ({
        id: account.id,
        name: account.name,
        email: account.email,
        ...(account.imageUrl ? { imageUrl: account.imageUrl } : {}),
        role: account.role,
      })),
    }),
  },
  {
    method: 'PUT',
    path: /^\/conversations\/([^/]+)\/assignment$/,
    access: { capability: 'REPLY_INBOX' },
    handle: (ctx, [id = '']) => assign(ctx, conversationOf(ctx, id)),
  },
  {
    method: 'PUT',
    path: /^\/conversations\/([^/]+)\/status$/,
    access: { capability: 'MANAGE_INBOX' },
    handle: (ctx, [id = '']) => changeStatus(ctx, conversationOf(ctx, id)),
  },
  {
    method: 'POST',
    path: /^\/conversations\/([^/]+)\/read$/,
    access: { capability: 'VIEW_INBOX' },
    handle: (ctx, [id = '']) => {
      conversationOf(ctx, id).unreadCount = 0;
      return { unreadCount: unreadTotal(scopeOf(grantOf(ctx))) };
    },
  },
];

/**
 * For tests: the channel's reply window of a conversation now ends at `endsAt`
 * (in the past: it has closed; `null`: the channel has none), as the store
 * would see it after the app last read it.
 */
export function setMockReplyWindow(conversationId: string, endsAt: string | null): void {
  const conversation = conversations.find((candidate) => candidate.id === conversationId);
  if (!conversation) throw new Error(`No mock conversation ${conversationId}`);
  if (endsAt === null) delete conversation.replyWindowEndsAt;
  else conversation.replyWindowEndsAt = endsAt;
}

/**
 * For tests: the next reply to a conversation is refused with `reason` (409),
 * while the conversation itself still reads as before: a store that learns of
 * a closed window only when it tries to send.
 */
export function refuseNextReply(
  conversationId: string,
  reason: 'REPLY_WINDOW_CLOSED' | 'CONVERSATION_CLOSED'
): void {
  refusals.set(conversationId, reason);
}

/** For tests: a customer writes, as one would between two reads. */
export function receiveMockMessage(conversationId: string, body: string): void {
  const conversation = conversations.find((candidate) => candidate.id === conversationId);
  if (!conversation) throw new Error(`No mock conversation ${conversationId}`);
  conversation.messages.push({
    id: `msg_in_${conversation.messages.length}`,
    direction: 'inbound',
    senderType: 'customer',
    senderName: conversation.contact.name,
    body,
    attachments: [],
    deliveryStatus: 'delivered',
    createdAt: new Date().toISOString(),
  });
  conversation.unreadCount += 1;
}

/**
 * For tests: somebody else changes a conversation (resolves or closes it on
 * the website, gives it to someone, moves it to a seller's inbox, out of the
 * store's reach), for the app's next step to meet.
 */
export function changeMockConversation(
  conversationId: string,
  change: Partial<Pick<MockConversation, 'status' | 'assigneeId' | 'vendorId'>>
): void {
  const conversation = conversations.find((candidate) => candidate.id === conversationId);
  if (!conversation) throw new Error(`No mock conversation ${conversationId}`);
  Object.assign(conversation, change);
}
