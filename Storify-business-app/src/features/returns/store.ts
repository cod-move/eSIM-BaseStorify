import { create } from 'zustand';
import type {
  Capability,
  ReturnCreateRequest,
  ReturnActionRequest,
  RefundExecuteRequest,
  Workspace,
} from '@/contracts/mobile/biz/v1';
export type ReturnWrite =
  | { kind: 'create'; request: ReturnCreateRequest }
  | { kind: 'action'; id: string; request: ReturnActionRequest }
  | { kind: 'refund'; request: RefundExecuteRequest };
export type ReturnAttempt = { key: string; routeId: string; write: ReturnWrite };
type Stored = {
  workspace: Workspace;
  kind: ReturnWrite['kind'];
  form?: object;
  attempt?: ReturnAttempt;
  revision?: number;
};
export const returnDraftKey = (
  actor: string,
  workspace: Workspace,
  kind: ReturnWrite['kind'],
  id: string
) => JSON.stringify([actor, workspace, kind, id]);
export const useReturnStore = create<{ entries: Record<string, Stored> }>(() => ({ entries: {} }));
export function updateReturnStore(
  key: string,
  workspace: Workspace,
  kind: ReturnWrite['kind'],
  change: Partial<Stored>
) {
  useReturnStore.setState(({ entries }) => ({
    entries: { ...entries, [key]: { ...entries[key], workspace, kind, ...change } },
  }));
}
/**
 * Drops a draft's form. An unconfirmed attempt stays, to be checked when the
 * screen opens again, and so does the revision that gives the next tap a new key.
 */
export function forgetReturnDraft(key: string) {
  useReturnStore.setState(({ entries }) => {
    const { [key]: entry, ...rest } = entries;
    return {
      entries:
        entry?.attempt || entry?.revision
          ? { ...rest, [key]: { ...entry, form: undefined } }
          : rest,
    };
  });
}
export const clearReturnDrafts = () => useReturnStore.setState({ entries: {} });
export function retainReturnDrafts(
  workspace: Workspace | null,
  capabilities: readonly Capability[]
) {
  useReturnStore.setState(({ entries }) => ({
    entries: Object.fromEntries(
      Object.entries(entries).filter(
        ([, value]) =>
          value.workspace === workspace &&
          capabilities.includes(value.kind === 'refund' ? 'ISSUE_REFUNDS' : 'HANDLE_RETURNS')
      )
    ),
  }));
}
