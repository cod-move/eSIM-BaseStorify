/**
 * The email or phone a guest just placed an order with, by order number, so
 * the outcome screen can fetch that order's receipt (the store finds a guest's
 * order by its number and contact). Kept in memory only: it is gone when the
 * app closes, and never written to the phone.
 */
const contacts = new Map<string, string>();

const keyOf = (orderNumber: string) => orderNumber.trim().toUpperCase();

export function rememberGuestContact(orderNumber: string, contact: string): void {
  contacts.set(keyOf(orderNumber), contact);
}

export function guestContactOf(orderNumber: string): string | undefined {
  return contacts.get(keyOf(orderNumber));
}
