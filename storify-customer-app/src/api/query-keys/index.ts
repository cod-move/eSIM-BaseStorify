import { accountKeys } from './account';
import { addressesKeys } from './addresses';
import { brandsKeys } from './brands';
import { cartKeys } from './cart';
import { categoriesKeys } from './categories';
import { chatKeys } from './chat';
import { checkoutKeys } from './checkout';
import { collectionsKeys } from './collections';
import { compareKeys } from './compare';
import { configKeys } from './config';
import { contentKeys } from './content';
import { couponsKeys } from './coupons';
import { couponsListKeys } from './coupons-list';
import { devicesKeys } from './devices';
import { guestTrackingKeys } from './guest-tracking';
import { homeKeys } from './home';
import { notificationsKeys } from './notifications';
import { ordersKeys } from './orders';
import { overviewKeys } from './overview';
import { paymentsKeys } from './payments';
import { preferencesKeys } from './preferences';
import { productKeys } from './product';
import { productsKeys } from './products';
import { returnsKeys } from './returns';
import { reviewsKeys } from './reviews';
import { reviewsWriteKeys } from './reviews-write';
import { searchStartKeys } from './search-start';
import { uploadsKeys } from './uploads';
import { vendorsKeys } from './vendors';
import { wishlistKeys } from './wishlist';

/**
 * Every query key in the app.
 *
 * The first part is who the data belongs to. `public` data is the same for
 * everybody. `private` data is one shopper's: everything under it is thrown
 * away when somebody signs in or out (see features/auth/use-session-sync).
 *
 * The second part is the locale: names and formatted prices differ per
 * language, so an answer in one language is never shown in another.
 *
 * Each area keeps its keys in a file of its own in this folder, merged here so
 * that every caller imports `queryKeys` from one place. To add an area, write
 * `<area>.ts`, import it above and spread it below, in alphabetical order so
 * areas added at the same time land on different lines. A key's name must not
 * be used by another area: the later spread would silently replace it.
 */
export const queryKeys = {
  ...accountKeys,
  ...addressesKeys,
  ...brandsKeys,
  ...cartKeys,
  ...categoriesKeys,
  ...chatKeys,
  ...checkoutKeys,
  ...collectionsKeys,
  ...compareKeys,
  ...configKeys,
  ...contentKeys,
  ...couponsKeys,
  ...couponsListKeys,
  ...devicesKeys,
  ...guestTrackingKeys,
  ...homeKeys,
  ...notificationsKeys,
  ...ordersKeys,
  ...overviewKeys,
  ...paymentsKeys,
  ...preferencesKeys,
  ...productKeys,
  ...productsKeys,
  ...returnsKeys,
  ...reviewsKeys,
  ...reviewsWriteKeys,
  ...searchStartKeys,
  ...uploadsKeys,
  ...vendorsKeys,
  ...wishlistKeys,
};

export const PRIVATE_QUERIES = ['private'] as const;
