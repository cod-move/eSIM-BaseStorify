/**
 * What an operator's workspace reaches, as the API scopes every query:
 * - the store (administrators and the store's staff): everything; a staff
 *   member assigned to locations, the products with stock there and that
 *   stock only;
 * - a seller (`vendor`): what has a part of theirs, narrowed to that part;
 * - a seller's staff: what is wholly their seller's, seen whole.
 */
import { STORE_LOCATION_IDS, VENDORS, type MockGrant } from './fixtures/accounts';

export type MockScope =
  | { kind: 'store'; locationIds?: readonly string[] }
  | { kind: 'seller'; vendorId: string }
  | { kind: 'sellerStaff'; vendorId: string };

export function scopeOf(grant: MockGrant): MockScope {
  if (grant.workspace === 'platform' || !grant.vendorId) {
    return grant.locationIds?.length
      ? { kind: 'store', locationIds: grant.locationIds }
      : { kind: 'store' };
  }
  return grant.role === 'vendor'
    ? { kind: 'seller', vendorId: grant.vendorId }
    : { kind: 'sellerStaff', vendorId: grant.vendorId };
}

/** Whether something owned by `vendorId` (none: the store's own) is in reach. */
export function reaches(scope: MockScope, vendorId: string | undefined): boolean {
  return scope.kind === 'store' || scope.vendorId === vendorId;
}

/** Whether the stock at a location is in reach: a staff member assigned to locations sees those only. */
export function seesLocation(scope: MockScope, locationId: string): boolean {
  return scope.kind !== 'store' || !scope.locationIds || scope.locationIds.includes(locationId);
}

/** The locations a product's stock is counted at: its owner's. */
export function locationsOf(vendorId: string | undefined): string[] {
  return vendorId ? (VENDORS[vendorId]?.locationIds ?? []) : STORE_LOCATION_IDS;
}

/** The seller's name, for the store's own operators. */
export function vendorNameFor(scope: MockScope, vendorId: string | undefined): string | undefined {
  return scope.kind === 'store' && vendorId ? VENDORS[vendorId]?.name : undefined;
}
