import { OperationQuery, type OperationStatus } from '@/contracts/mobile/biz/v1';

import { accountOf, grantOf, invalid, MockError, type MockContext, type MockRoute } from '../kit';

type MockOperation = {
  operation: OperationStatus;
  accountId: string;
  workspace: string;
  authorize: (ctx: MockContext) => void;
};
const operations = new Map<string, MockOperation>();

export function reset(): void {
  operations.clear();
}

/** Simulates a store confirming a previously uncertain operation, without another write. */
export function changeMockOperation(
  key: string,
  change: (operation: OperationStatus) => OperationStatus
): void {
  for (const held of operations.values()) {
    if (held.operation.key === key) held.operation = change(held.operation);
  }
}

function operationId(ctx: MockContext, key: string) {
  return `${accountOf(ctx).id}|${grantOf(ctx).workspace}|${key}`;
}

/** Every domain supplies current write/resource authorization for reconciliation. */
export function keepMockOperation(
  ctx: MockContext,
  operation: OperationStatus,
  authorize: (ctx: MockContext) => void
): void {
  operations.set(operationId(ctx, operation.key), {
    operation,
    accountId: accountOf(ctx).id,
    workspace: grantOf(ctx).workspace,
    authorize,
  });
}

export const routes: readonly MockRoute[] = [
  {
    method: 'GET',
    path: '/operations',
    access: 'workspace',
    handle: (ctx) => {
      const parsed = OperationQuery.safeParse({ key: ctx.query.get('key') ?? undefined });
      if (!parsed.success) throw invalid('key', 'A valid operation key is required');
      const held = operations.get(operationId(ctx, parsed.data.key));
      if (
        !held ||
        held.accountId !== accountOf(ctx).id ||
        held.workspace !== grantOf(ctx).workspace
      ) {
        throw new MockError(404, 'NOT_FOUND', 'Operation not found');
      }
      held.authorize(ctx);
      return held.operation;
    },
  },
];
