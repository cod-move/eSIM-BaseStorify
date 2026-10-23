import type { Me, WorkspaceAccess } from '@/contracts/mobile/biz/v1';

import { resolveWorkspace } from '../resolve-workspace';

const access = (workspace: 'platform' | 'vendor'): WorkspaceAccess => ({
  workspace,
  role: workspace === 'platform' ? 'staff' : 'vendor',
  capabilities: ['VIEW_ORDERS'],
  permissions: ['view_orders'],
  scoped: false,
});

const me = (workspaces: WorkspaceAccess[]): Me => ({
  id: 'user_1',
  name: 'Farhan',
  email: 'farhan@example.com',
  role: 'staff',
  isOwner: false,
  twoFactorEnabled: false,
  workspaces,
});

describe('resolveWorkspace', () => {
  it('waits for GET /me', () => {
    expect(resolveWorkspace(undefined, null)).toEqual({ status: 'loading' });
  });

  it('opens the only workspace directly, whatever was chosen before', () => {
    const state = resolveWorkspace(me([access('vendor')]), {
      userId: 'user_1',
      workspace: 'platform',
    });
    expect(state).toMatchObject({ status: 'ready', workspace: 'vendor' });
  });

  it('asks which of two, until one is chosen', () => {
    const both = me([access('platform'), access('vendor')]);
    expect(resolveWorkspace(both, null)).toMatchObject({ status: 'choose' });
    expect(resolveWorkspace(both, { userId: 'user_1', workspace: 'vendor' })).toMatchObject({
      status: 'ready',
      workspace: 'vendor',
      access: { workspace: 'vendor' },
    });
  });

  it("does not take somebody else's choice on the same phone", () => {
    const both = me([access('platform'), access('vendor')]);
    expect(resolveWorkspace(both, { userId: 'user_2', workspace: 'vendor' })).toMatchObject({
      status: 'choose',
    });
  });

  it('says so when there is nowhere to work', () => {
    expect(resolveWorkspace(me([]), null)).toEqual({ status: 'none' });
  });
});
