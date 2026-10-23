/**
 * Every area of the mock store. The dispatcher, `server.ts`, tries their routes.
 *
 * To add an area, add files and list it here; nothing else changes:
 * 1. `routes/<area>.ts` exports what `MockArea` (kit.ts) describes: `routes`
 *    for the mobile API, `authRoutes` for `/api/auth`, and `reset` if the area
 *    remembers something of its own. What the areas share is in `state.ts`.
 * 2. `fixtures/<area>.ts` holds its data, in the shape of the contract.
 * 3. `__tests__/mock-<area>.test.ts` holds every answer against the contract.
 * 4. Import the module below and add it to `AREAS`.
 *
 * An endpoint belongs to one area, so the order of the areas does not matter.
 * They are kept in alphabetical order, so areas added at the same time land on
 * different lines.
 */
import type { MockArea } from '../kit';

import * as account from './account';
import * as addresses from './addresses';
import * as auth from './auth';
import * as brands from './brands';
import * as cart from './cart';
import * as categories from './categories';
import * as chat from './chat';
import * as checkout from './checkout';
import * as collections from './collections';
import * as compare from './compare';
import * as config from './config';
import * as content from './content';
import * as coupons from './coupons';
import * as couponsList from './coupons-list';
import * as devices from './devices';
import * as events from './events';
import * as guestTracking from './guest-tracking';
import * as home from './home';
import * as notifications from './notifications';
import * as orders from './orders';
import * as overview from './overview';
import * as payments from './payments';
import * as preferences from './preferences';
import * as product from './product';
import * as products from './products';
import * as returns from './returns';
import * as reviews from './reviews';
import * as reviewsWrite from './reviews-write';
import * as searchStart from './search-start';
import * as uploads from './uploads';
import * as vendors from './vendors';
import * as wishlist from './wishlist';

export const AREAS: Readonly<Record<string, MockArea>> = {
  account,
  addresses,
  auth,
  brands,
  cart,
  categories,
  chat,
  checkout,
  collections,
  compare,
  config,
  content,
  coupons,
  couponsList,
  devices,
  events,
  guestTracking,
  home,
  notifications,
  orders,
  overview,
  payments,
  preferences,
  product,
  products,
  returns,
  reviews,
  reviewsWrite,
  searchStart,
  uploads,
  vendors,
  wishlist,
};
