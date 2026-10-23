/** Endpoints: Home's figures. */
import { Home } from '@/contracts/mobile/biz/v1';

import { api } from '../api';
import type { Conditional } from '../etag-query';
import type { WorkspaceScope } from '../scope';

/** GET /home: the tiles the operator may see, in their order. Unchanged figures are a 304. */
export function getHome({ locale, workspace }: WorkspaceScope, { etag, signal }: Conditional) {
  return api.request({ locale, workspace, path: '/home', etag, signal }, Home);
}
