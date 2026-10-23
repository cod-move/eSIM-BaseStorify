/** Endpoints: conversations with customers. */
import {
  ATTACHMENT_FORM_FIELDS,
  Conversation,
  ConversationAssignees,
  ConversationList,
  ConversationMessages,
  ConversationReadResult,
  SentMessage,
  type ConversationAssignmentRequest,
  type ConversationListQuery,
  type ConversationMessagesQuery,
  type ConversationNoteRequest,
  type ConversationStatusRequest,
  type SendMessageRequest,
} from '@/contracts/mobile/biz/v1';

import { api } from '../api';
import type { Conditional } from '../etag-query';
import type { WorkspaceScope } from '../scope';

/** GET /conversations: a page, the most recent message first, with the unread count of all. */
export function getConversations(
  { locale, workspace }: WorkspaceScope,
  query: ConversationListQuery,
  { etag, signal }: Conditional
) {
  return api.request(
    { locale, workspace, path: '/conversations', query, etag, signal },
    ConversationList
  );
}

/** GET /conversations/{id}/messages: newest first; `cursor` pages back in time. */
export function getConversationMessages(
  { locale, workspace }: WorkspaceScope,
  id: string,
  query: ConversationMessagesQuery,
  { etag, signal }: Conditional
) {
  return api.request(
    {
      locale,
      workspace,
      path: `/conversations/${encodeURIComponent(id)}/messages`,
      query,
      etag,
      signal,
    },
    ConversationMessages
  );
}

/** POST /conversations/{id}/attachments: one file, with text if any; sent once per key. */
export function sendAttachment(
  { locale, workspace }: WorkspaceScope,
  id: string,
  { file, filename, body }: { file: Blob; filename: string; body: string },
  idempotencyKey: string
) {
  const multipartBody = new FormData();
  multipartBody.append(ATTACHMENT_FORM_FIELDS.file, file, filename);
  if (body) multipartBody.append(ATTACHMENT_FORM_FIELDS.body, body);
  return api.data(
    {
      locale,
      workspace,
      path: `/conversations/${encodeURIComponent(id)}/attachments`,
      method: 'POST',
      multipartBody,
      idempotencyKey,
    },
    SentMessage
  );
}

/** POST /conversations/{id}/messages: a reply (text, a product, or both), sent once per key. */
export function sendMessage(
  { locale, workspace }: WorkspaceScope,
  id: string,
  body: SendMessageRequest,
  idempotencyKey: string
) {
  return api.data(
    {
      locale,
      workspace,
      path: `/conversations/${encodeURIComponent(id)}/messages`,
      method: 'POST',
      body,
      idempotencyKey,
    },
    SentMessage
  );
}

/** POST /conversations/{id}/notes: an internal note, the team's alone; written once per key. */
export function addNote(
  { locale, workspace }: WorkspaceScope,
  id: string,
  body: ConversationNoteRequest,
  idempotencyKey: string
) {
  return api.data(
    {
      locale,
      workspace,
      path: `/conversations/${encodeURIComponent(id)}/notes`,
      method: 'POST',
      body,
      idempotencyKey,
    },
    SentMessage
  );
}

/** GET /conversations/{id}/assignees: who the conversation may be given to. */
export function getConversationAssignees(
  { locale, workspace }: WorkspaceScope,
  id: string,
  signal?: AbortSignal
) {
  return api.data(
    { locale, workspace, path: `/conversations/${encodeURIComponent(id)}/assignees`, signal },
    ConversationAssignees
  );
}

/** PUT /conversations/{id}/assignment: someone in the team, the operator, or nobody (`null`). */
export function setConversationAssignment(
  { locale, workspace }: WorkspaceScope,
  id: string,
  body: ConversationAssignmentRequest
) {
  return api.data(
    {
      locale,
      workspace,
      path: `/conversations/${encodeURIComponent(id)}/assignment`,
      method: 'PUT',
      body,
    },
    Conversation
  );
}

/** PUT /conversations/{id}/status: `resolved`, or `open` again. */
export function setConversationStatus(
  { locale, workspace }: WorkspaceScope,
  id: string,
  body: ConversationStatusRequest
) {
  return api.data(
    {
      locale,
      workspace,
      path: `/conversations/${encodeURIComponent(id)}/status`,
      method: 'PUT',
      body,
    },
    Conversation
  );
}

/** POST /conversations/{id}/read: the customer's messages in it are read. */
export function markConversationRead({ locale, workspace }: WorkspaceScope, id: string) {
  return api.data(
    {
      locale,
      workspace,
      path: `/conversations/${encodeURIComponent(id)}/read`,
      method: 'POST',
    },
    ConversationReadResult
  );
}
