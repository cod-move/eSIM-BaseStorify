import { useEffect } from 'react';

import { useSession } from '@/features/auth/use-session';
import { useCan, useWorkspaceScope } from '@/features/workspace/use-workspace';

import {
  changeReplyDraft,
  replyDraftKey,
  setNoteMode,
  useNoteMode,
  useStoredReplyDraft,
  type DraftAttachment,
  type DraftKind,
} from './reply-drafts';

/**
 * The key of a thread's draft of one kind, for the person signed in and the
 * workspace they work in; `null` until both are known.
 */
export function useReplyDraftKey(id: string, kind: DraftKind = 'reply') {
  const scope = useWorkspaceScope();
  const { user } = useSession();
  const workspace = scope?.workspace;
  return {
    key: user && workspace ? replyDraftKey(user.id, workspace, id, kind) : null,
    workspace,
  };
}

/**
 * Memory-only unsent text, and the product or file put on it, survive a
 * composer or thread unmount, a turn at writing a note, and a window that
 * closes meanwhile. Private cleanup clears them when the actor or workspace
 * changes. A lost read grant clears them too; a closed reply window or lost
 * reply grant keeps them. A thread's note for the team (`kind` `note`) is a
 * draft of its own.
 */
export function useReplyDraft(id: string, kind: DraftKind = 'reply') {
  const { user } = useSession();
  const canRead = useCan('VIEW_INBOX');
  const { key, workspace } = useReplyDraftKey(id, kind);
  const draft = useStoredReplyDraft(key);
  const available = Boolean(workspace && user && canRead);

  useEffect(() => {
    if (!available && key && workspace) changeReplyDraft(key, workspace, () => ({ text: '' }));
  }, [available, key, workspace]);

  type Held = { text: string; attached?: DraftAttachment };
  const change = (next: (held: Held) => Held) => {
    if (available && key && workspace) changeReplyDraft(key, workspace, next);
  };

  return {
    text: available ? (draft?.text ?? '') : '',
    attached: available ? draft?.attached : undefined,
    setText: (text: string) => change((held) => ({ ...held, text })),
    setAttached: (attached: DraftAttachment | null) =>
      change((held) => ({ ...held, attached: attached ?? undefined })),
  };
}

/** Whether the thread's composer is the note's: kept with the drafts, so a note goes on where it was left. */
export function useNoteComposer(id: string) {
  const { key, workspace } = useReplyDraftKey(id, 'note');
  const noting = useNoteMode(key);
  return {
    noting,
    setNoting: (on: boolean) => {
      if (key && workspace) setNoteMode(key, workspace, on);
    },
  };
}
