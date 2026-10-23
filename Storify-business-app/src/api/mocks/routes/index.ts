/**
 * Every area of the mock store. The dispatcher, `server.ts`, tries their routes.
 *
 * To add an area, add files and list it here; nothing else changes:
 * 1. `routes/<area>.ts` exports what `MockArea` (kit.ts) describes: `routes`
 *    for the business API (each with its `access`), `authRoutes` for
 *    `/api/auth`, and `reset` if the area remembers something of its own.
 * 2. `fixtures/<area>.ts` holds its data, in the shape of the contract.
 * 3. `__tests__/mock-<area>.test.ts` holds every answer against the contract.
 * 4. Import the module below and add it to `AREAS`.
 *
 * An endpoint belongs to one area, so the order of the areas does not matter.
 * They are kept in alphabetical order, so areas added at the same time land on
 * different lines.
 */
import type { MockArea } from '../kit';

import * as auth from './auth';
import * as config from './config';
import * as customers from './customers';
import * as devices from './devices';
import * as home from './home';
import * as inbox from './inbox';
import * as me from './me';
import * as notifications from './notifications';
import * as operations from './operations';
import * as orderCreation from './order-creation';
import * as orders from './orders';
import * as payouts from './payouts';
import * as productEditor from './product-editor';
import * as products from './products';
import * as returns from './returns';
import * as uploads from './uploads';
import * as vendorApplications from './vendor-applications';

export const AREAS: Readonly<Record<string, MockArea>> = {
  auth,
  config,
  customers,
  devices,
  home,
  inbox,
  me,
  notifications,
  operations,
  orderCreation,
  orders,
  payouts,
  productEditor,
  products,
  returns,
  uploads,
  vendorApplications,
};
