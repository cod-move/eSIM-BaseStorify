import type { VendorApplicationListQuery } from '@/contracts/mobile/biz/v1';

import type { WorkspaceScope } from '../scope';
import { inWorkspace } from './shared';

type ApplicationFilter = Omit<VendorApplicationListQuery, 'cursor' | 'limit'>;

export const vendorApplicationsKeys = {
  /** Every application list of the workspace, whatever the tab, search and language. */
  vendorApplicationLists: (scope: WorkspaceScope | null) =>
    [...inWorkspace(scope, 'vendor-applications'), 'list'] as const,
  vendorApplicationList: (scope: WorkspaceScope | null, filter: ApplicationFilter) =>
    [...inWorkspace(scope, 'vendor-applications'), 'list', scope?.locale, filter] as const,
  vendorApplication: (scope: WorkspaceScope | null, id: string) =>
    [...inWorkspace(scope, 'vendor-applications'), 'detail', id, scope?.locale] as const,
};
