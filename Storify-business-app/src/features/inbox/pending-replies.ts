import { create } from 'zustand';

import { clearReplyDrafts } from './reply-drafts';

import type { PendingReply } from './thread-rows';

/**
 * The replies on their way, per conversation, kept outside the thread's
 * screen: a reply sent just before the operator went back is still there
 * when they return, "sending" or "not sent", with its own key for "Try
 * again". Memory only; forgotten when the person changes (`useSessionSync`),
 * as the changes waiting for an answer are.
 */
type PendingRepliesState = {
  /** By `threadKey`: the workspace and the conversation. */
  threads: Record<string, PendingReply[]>;
  /**
   * By `threadKey`: the messages the store made of the replies it took, by
   * id. Each is its own reply's copy, and never stands for another reply with
   * the same words (`unsettledReplies`).
   */
  stored: Record<string, string[]>;
};

const usePendingRepliesStore = create<PendingRepliesState>(() => ({ threads: {}, stored: {} }));

const NONE: PendingReply[] = [];
const NO_IDS: string[] = [];

/** Whose replies these are: moved on by `clearPendingReplies`, at a change of person. */
let generation = 0;

/** One conversation in one workspace: replies of one never show in the other. */
export function threadKey(workspace: string | undefined, conversationId: string): string {
  return `${workspace ?? ''}:${conversationId}`;
}

/** A conversation's replies on their way, in the order they were sent. */
export function usePendingReplies(thread: string): PendingReply[] {
  return usePendingRepliesStore((state) => state.threads[thread] ?? NONE);
}

/** The ids of the messages the store made of this conversation's replies. */
export function useStoredReplyIds(thread: string): string[] {
  return usePendingRepliesStore((state) => state.stored[thread] ?? NO_IDS);
}

/** A conversation's replies on their way as they are now, outside a render. */
export function pendingRepliesOf(thread: string): PendingReply[] {
  return usePendingRepliesStore.getState().threads[thread] ?? NONE;
}

export function updatePendingReplies(
  thread: string,
  change: (replies: PendingReply[]) => PendingReply[]
): void {
  usePendingRepliesStore.setState((state) => ({
    threads: { ...state.threads, [thread]: change(state.threads[thread] ?? NONE) },
  }));
}

/** A reply the store took: it is no longer on its way, and `messageId` is the message it became. */
export function replyStored(thread: string, localId: string, messageId: string): void {
  usePendingRepliesStore.setState((state) => ({
    threads: {
      ...state.threads,
      [thread]: (state.threads[thread] ?? NONE).filter((reply) => reply.localId !== localId),
    },
    stored: { ...state.stored, [thread]: [...(state.stored[thread] ?? NO_IDS), messageId] },
  }));
}

/**
 * Taken when a reply is sent: says, once its answer comes, whether the person
 * who sent it still uses the app. If not, their replies were forgotten with
 * them, and nothing is changed or said for this one.
 */
export function sentByThisPerson(): () => boolean {
  const sender = generation;
  return () => sender === generation;
}

/** Forgets every reply on its way: for a change of person, and before each test. */
export function clearPendingReplies(): void {
  generation += 1;
  clearReplyDrafts();
  usePendingRepliesStore.setState({ threads: {}, stored: {} });
}
