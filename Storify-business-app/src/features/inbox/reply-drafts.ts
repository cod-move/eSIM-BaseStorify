import { create } from 'zustand';

import type { SelectedUploadFile } from '@/features/uploads/selected-file';

import type { ReplyProduct } from './thread-rows';

/** A product or a file put on a reply, before it is sent. */
export type DraftAttachment = { product?: ReplyProduct; file?: SelectedUploadFile };

type Draft = { workspace: string; text: string; attached?: DraftAttachment };

type DraftsState = {
  drafts: Record<string, Draft>;
  /** By `replyDraftKey(…, 'note')`: the threads whose composer is the note's. */
  noting: Record<string, string>;
};

const useDrafts = create<DraftsState>(() => ({ drafts: {}, noting: {} }));

/** What a draft is for: a reply to the customer, or a note for the team. */
export type DraftKind = 'reply' | 'note';

/**
 * Actor, workspace, thread and kind are separate tuple entries, so IDs cannot
 * collide, and a thread's reply and note are never the same draft.
 */
export function replyDraftKey(
  actorId: string,
  workspace: string,
  id: string,
  kind: DraftKind = 'reply'
): string {
  return JSON.stringify([actorId, workspace, id, kind]);
}

const EMPTY: Draft | undefined = undefined;

export function useStoredReplyDraft(key: string | null): Draft | undefined {
  return useDrafts((state) => (key ? state.drafts[key] : EMPTY));
}

/** Whether the thread's composer is the note's (`key`: the note draft's). */
export function useNoteMode(key: string | null): boolean {
  return useDrafts((state) => (key ? key in state.noting : false));
}

export function setNoteMode(key: string, workspace: string, on: boolean): void {
  useDrafts.setState((state) => {
    const noting = { ...state.noting };
    if (on) noting[key] = workspace;
    else delete noting[key];
    return { noting };
  });
}

/** Changes a draft; one with neither text nor anything attached is forgotten. */
export function changeReplyDraft(
  key: string,
  workspace: string,
  change: (draft: Pick<Draft, 'text' | 'attached'>) => Pick<Draft, 'text' | 'attached'>
): void {
  useDrafts.setState((state) => {
    const held = state.drafts[key];
    const next = change({ text: held?.text ?? '', attached: held?.attached });
    const drafts = { ...state.drafts };
    if (next.text || next.attached) drafts[key] = { workspace, ...next };
    else delete drafts[key];
    return { drafts };
  });
}

export function setReplyDraft(key: string, workspace: string, text: string): void {
  changeReplyDraft(key, workspace, (draft) => ({ ...draft, text }));
}

/**
 * Puts what was sent back in the draft, to change it: its words before any
 * written since, and what it carried unless something else is on the draft.
 */
export function restoreReplyDraft(
  key: string,
  workspace: string,
  restored: { text: string; attached?: DraftAttachment }
): void {
  changeReplyDraft(key, workspace, (draft) => ({
    text: [restored.text, draft.text].filter(Boolean).join('\n\n'),
    attached: draft.attached ?? restored.attached,
  }));
}

/** No sensitive text is persisted; identity changes discard every draft. */
export function clearReplyDrafts(): void {
  useDrafts.setState({ drafts: {}, noting: {} });
}

/** A workspace switch or a lost read grant discards affected private text. */
export function retainWorkspaceReplyDrafts(workspace: string | null, canRead: boolean): void {
  const kept = (entry: string) => canRead && entry === workspace;
  useDrafts.setState((state) => ({
    drafts: Object.fromEntries(
      Object.entries(state.drafts).filter(([, draft]) => kept(draft.workspace))
    ),
    noting: Object.fromEntries(Object.entries(state.noting).filter(([, at]) => kept(at))),
  }));
}
