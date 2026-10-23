import { configKeys } from './config';
import { customersKeys } from './customers';
import { homeKeys } from './home';
import { inboxKeys } from './inbox';
import { meKeys } from './me';
import { notificationsKeys } from './notifications';
import { operationsKeys } from './operations';
import { ordersKeys } from './orders';
import { payoutsKeys } from './payouts';
import { productsKeys } from './products';
import { returnsKeys } from './returns';
import { uploadsKeys } from './uploads';
import { vendorApplicationsKeys } from './vendor-applications';

/**
 * Every query key in the app.
 *
 * The first part is who the data belongs to:
 * - `public`: the same for everybody (the store's settings).
 * - `private`, then `account`: the operator's own (who they are, their
 *   notifications), whatever workspace they are in.
 * - `private`, then `workspace` and the workspace: the store's business as
 *   seen from one workspace (orders, products, inbox, payouts, applications,
 *   Home's figures).
 *
 * Everything under `private` is thrown away when somebody signs in or out
 * (features/auth/use-session-sync), and everything under `workspace` when the
 * operator switches workspace (features/workspace). The language comes after
 * the area, so an area can be refreshed in every language at once, and an
 * answer in one language is never shown in another.
 *
 * Each area keeps its keys in a file of its own in this folder, merged here so
 * that every caller imports `queryKeys` from one place. To add an area, write
 * `<area>.ts`, import it above and spread it below, in alphabetical order. A
 * key's name must not be used by another area: the later spread would replace it.
 */
export const queryKeys = {
  ...configKeys,
  ...customersKeys,
  ...homeKeys,
  ...inboxKeys,
  ...meKeys,
  ...notificationsKeys,
  ...operationsKeys,
  ...ordersKeys,
  ...payoutsKeys,
  ...productsKeys,
  ...returnsKeys,
  ...uploadsKeys,
  ...vendorApplicationsKeys,
};

/** Everything that belongs to the person signed in. */
export const PRIVATE_QUERIES = ['private'] as const;
/** Everything seen from a workspace: cleared when the operator switches workspace. */
export const WORKSPACE_QUERIES = ['private', 'workspace'] as const;
/** GET /me, in every language: read again when the operator's access changes. */
export const ME_QUERIES = ['private', 'account', 'me'] as const;
/** The notification lists, every filter and language: read again after marking some read. */
export const NOTIFICATION_QUERIES = ['private', 'account', 'notifications'] as const;
