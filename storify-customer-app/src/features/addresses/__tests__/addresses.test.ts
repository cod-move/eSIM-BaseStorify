import { call, dataOf, signIn } from '@/api/__tests__/mock-helpers';
import { resetMockServer } from '@/api/mocks/server';
import { AddressBook } from '@/contracts/mobile/shop/v1';

import { checkForm, defaultFirst, toForm, toRequest } from '../use-addresses';

beforeEach(resetMockServer);

describe('the address form', () => {
  const filled = {
    ...toForm(),
    firstName: 'Nadia',
    street: '12 Lake Road',
    city: 'Dhaka',
    country: 'Bangladesh',
  };

  it('asks for a name, a street, a city and a country', () => {
    expect(checkForm(toForm())).toEqual({
      firstName: 'required',
      street: 'required',
      city: 'required',
      country: 'required',
    });
    expect(checkForm(filled)).toEqual({});
  });

  it('refuses a street shorter than five characters, as checkout does', () => {
    expect(checkForm({ ...filled, street: ' Rd 1 ' })).toEqual({ street: 'streetTooShort' });
    expect(checkForm({ ...filled, street: 'Rd 12' })).toEqual({});
  });

  it('trims every field and leaves out the empty optional ones', () => {
    expect(toRequest({ ...filled, firstName: ' Nadia ', apartment: '  ', phone: ' 017 ' })).toEqual(
      {
        label: 'home',
        firstName: 'Nadia',
        lastName: undefined,
        street: '12 Lake Road',
        apartment: undefined,
        city: 'Dhaka',
        state: undefined,
        postalCode: undefined,
        country: 'Bangladesh',
        phone: '017',
      }
    );
  });
});

describe('the mock address book', () => {
  it('is closed to a guest', async () => {
    expect((await call('/addresses')).response.status).toBe(401);
  });

  it('keeps exactly one default through every change', async () => {
    const { headers } = await signIn();
    const send = (path: string, method: string, body?: unknown) =>
      dataOf(AddressBook, path, { headers, method, body });

    const seeded = await send('/addresses', 'GET');
    const added = await send('/addresses', 'POST', {
      street: '12 Lake Road',
      city: 'Dhaka',
      country: 'Bangladesh',
      isDefault: true,
    });
    const created = added.items.find((a) => a.street === '12 Lake Road');
    expect(created).toMatchObject({ isDefault: true, label: 'other' });
    expect(added.items.filter((a) => a.isDefault)).toHaveLength(1);

    const removed = await send(`/addresses/${created?.id}`, 'DELETE');
    expect(removed.items).toHaveLength(seeded.items.length);
    expect(removed.items.filter((a) => a.isDefault)).toHaveLength(1);

    const last = removed.items[removed.items.length - 1];
    const changed = await send(`/addresses/${last?.id}/default`, 'PUT');
    expect(defaultFirst(changed.items)[0]?.id).toBe(last?.id);
  });

  it('refuses an address without a street', async () => {
    const { headers } = await signIn();
    const { response } = await call('/addresses', {
      headers,
      method: 'POST',
      body: { city: 'Dhaka', country: 'Bangladesh' },
    });
    expect(response.status).toBe(422);
  });
});
