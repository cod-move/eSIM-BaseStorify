import { act, renderHook } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { Capability, Workspace } from '@/contracts/mobile/biz/v1';
import {
  clearPendingNotificationOpen,
  useOpenNotification,
  usePendingNotificationOpen,
} from '../use-open-notification';
let mockActor = 'operator';
let mockWorkspace = 'platform';
let mockCapabilities: Capability[] = ['VIEW_RETURNS'];
let mockWorkspaces: Workspace[] = ['platform', 'vendor'];
const mockSwitch = jest.fn();
const mockOpenTab = jest.fn();
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock('@/features/config/use-config', () => ({
  useConfig: () => ({ data: { store: { websiteUrl: 'https://store.test/' } } }),
}));
jest.mock('@/features/auth/use-session', () => ({
  useSession: () => ({ user: mockActor ? { id: mockActor } : null, isPending: false }),
}));
jest.mock('@/features/workspace/use-switch-workspace', () => ({
  useSwitchWorkspace: () => mockSwitch,
  openTab: (...args: unknown[]) => mockOpenTab(...args),
}));
jest.mock('@/features/workspace/use-workspace', () => ({
  useWorkspace: () => ({
    status: 'ready',
    workspace: mockWorkspace,
    access: { capabilities: mockCapabilities },
    workspaces: mockWorkspaces.map((workspace) => ({ workspace, capabilities: mockCapabilities })),
  }),
}));
beforeEach(() => {
  clearPendingNotificationOpen();
  mockActor = 'operator';
  mockWorkspace = 'platform';
  mockCapabilities = ['VIEW_RETURNS'];
  mockWorkspaces = ['platform', 'vendor'];
  jest.clearAllMocks();
});
const mount = () =>
  renderHook(() => {
    usePendingNotificationOpen();
    return useOpenNotification();
  });
it('waits for the destination workspace and opens the permitted native return', async () => {
  const rendered = await mount();
  await act(async () => rendered.result.current('/en/vendor/returns/case_1'));
  expect(mockSwitch).toHaveBeenCalledWith('vendor');
  expect(router.push).not.toHaveBeenCalled();
  mockWorkspace = 'vendor';
  await rendered.rerender(undefined);
  expect(router.push).toHaveBeenCalledWith({ pathname: '/returns/[id]', params: { id: 'case_1' } });
});
it('rechecks capability after a workspace switch before opening a pending link', async () => {
  const rendered = await mount();
  await act(async () => rendered.result.current('/en/vendor/returns/case_1'));
  mockWorkspace = 'vendor';
  mockCapabilities = [];
  await rendered.rerender(undefined);
  // Home, in the tabs the switch has gone back to.
  expect(router.navigate).toHaveBeenCalledWith('/');
  expect(router.push).not.toHaveBeenCalled();
});
it('drops a pending private link when the account changes', async () => {
  const rendered = await mount();
  await act(async () => rendered.result.current('/en/vendor/returns/case_1'));
  mockActor = 'different-operator';
  mockWorkspace = 'vendor';
  await rendered.rerender(undefined);
  expect(router.push).not.toHaveBeenCalled();
});
it('drops a pending link when its workspace leaves GET /me, so a later switch does not open it', async () => {
  const rendered = await mount();
  await act(async () => rendered.result.current('/en/vendor/returns/case_1'));
  expect(mockSwitch).toHaveBeenCalledWith('vendor');
  mockWorkspaces = ['platform'];
  await rendered.rerender(undefined);

  mockWorkspaces = ['platform', 'vendor'];
  mockWorkspace = 'vendor';
  await rendered.rerender(undefined);
  expect(router.push).not.toHaveBeenCalled();
  expect(router.navigate).not.toHaveBeenCalled();
});
it('opens a tab by going back to the tabs, never by stacking another set of them', async () => {
  mockCapabilities = ['VIEW_ORDERS'];
  const rendered = await mount();
  await act(async () => rendered.result.current('/en/admin/orders'));
  expect(mockOpenTab).toHaveBeenCalledWith('/orders');
  expect(router.push).not.toHaveBeenCalled();
});
it('opens Home the same way when the screen is not the operator’s to see', async () => {
  mockCapabilities = [];
  const rendered = await mount();
  await act(async () => rendered.result.current('/en/admin/orders/ord_1'));
  expect(mockOpenTab).toHaveBeenCalledWith('/');
  expect(router.push).not.toHaveBeenCalled();
});
