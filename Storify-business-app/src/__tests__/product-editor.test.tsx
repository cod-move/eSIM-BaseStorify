import { onlineManager } from '@tanstack/react-query';
import { act, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Animated } from 'react-native';

import * as endpoints from '@/api/endpoints/product-editor';
import * as uploads from '@/api/endpoints/uploads';
import { ApiError, NetworkError } from '@/api/errors';
import { allMockProducts, changeMockProduct } from '@/api/mocks/routes/products';
import { selectedUploadFile } from '@/features/uploads/selected-file';
import { selectUploadFile } from '@/features/uploads/select-file';

import './hooks';
import './preload-app';
import { currentPath, openTab, press, settle, signIn, tap, type, wait } from './screens';

jest.mock('@/features/uploads/select-file', () => ({ selectUploadFile: jest.fn() }));

// Each test signs in and walks the whole editor; under a full parallel run that
// takes longer than Jest's default 5 seconds.
jest.setTimeout(20_000);

beforeEach(() => {
  onlineManager.setOnline(true);
  // Native-driver animations do not advance their JS opacity in Jest. Model
  // their completed state so visibility checks cover the presented sheet.
  const timing = Animated.timing;
  jest.spyOn(Animated, 'timing').mockImplementation((value, config) => {
    if (config.duration !== 320 && config.duration !== 200) return timing(value, config);
    return {
      start: (done) => {
        if (value instanceof Animated.Value && typeof config.toValue === 'number')
          value.setValue(config.toValue);
        done?.({ finished: true });
      },
      stop: () => undefined,
      reset: () => undefined,
    };
  });
});
afterEach(() => {
  onlineManager.setOnline(true);
  jest.restoreAllMocks();
});
async function createScreen() {
  await signIn();
  await openTab('Products');
  await press('Add product');
  await settle();
  await screen.findByRole('header', { name: 'New product' });
}
async function choose(label: string, name: string) {
  await press(label);
  await wait(400);
  await tap(screen.getByRole('radio', { name }));
  await wait(400);
}
async function describe(html: string) {
  await tap(screen.getByRole('radio', { name: 'HTML' }));
  await type('Description HTML, required', html);
}
async function requiredFields() {
  await type('Product name, required', 'Product from phone');
  await describe('<p>Created with a complete native editor.</p>');
  await choose('Category', 'Home');
}
/** The editor, opened from the product's page as the operator opens it. */
async function editorScreen() {
  await signIn();
  await act(async () => router.push({ pathname: '/products/[id]', params: { id: 'prod_vase' } }));
  await settle();
  await openEditor();
}
async function openEditor() {
  await act(async () =>
    router.push({ pathname: '/products/[id]/edit', params: { id: 'prod_vase' } })
  );
  await settle();
  await screen.findByRole('header', { name: 'Full product editor' });
}
/** The next save is made by the store, and its answer says the outcome is not confirmed. */
function unconfirmNextSave() {
  const original = endpoints.saveFullProduct;
  return jest.spyOn(endpoints, 'saveFullProduct').mockImplementationOnce(async (...args) => {
    const result = await original(...args);
    throw new ApiError(409, 'CONFLICT', '', {
      reason: 'OPERATION_RECONCILIATION_REQUIRED',
      details: { operation: { ...result.operation, state: 'unknown' } },
    });
  });
}
async function reviewSave(label = 'Save product') {
  await press('Review product');
  await wait(400);
  await press(label);
  await settle();
}

it('creates a physical product with native fields and opens its authoritative detail', async () => {
  await createScreen();
  await requiredFields();
  await press('Pricing');
  await type('Price, required', '19.5');
  await press('Inventory');
  await type('Initial stock, Optional', '4');
  await reviewSave('Create product');
  expect(await screen.findByRole('header', { name: 'Product from phone' })).toBeVisible();
  expect(screen.getByLabelText('Price, $19.50')).toBeVisible();
  expect(allMockProducts().filter((product) => product.name === 'Product from phone')).toHaveLength(
    1
  );
});

it('shows validation and keeps the draft instead of sending an incomplete product', async () => {
  await createScreen();
  const submit = jest.spyOn(endpoints, 'createFullProduct');
  await press('Review product');
  await wait(400);
  expect(screen.getByText('Check product fields')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Create product' })).toBeNull();
  expect(submit).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Product name, required')).toBeVisible();
  expect(screen.getByText('Choose a category')).toBeVisible();
});

it('preserves edits across sections and requires discard confirmation on Back', async () => {
  await createScreen();
  await type('Product name, required', 'Keep my draft');
  await press('Pricing');
  await press('Details');
  expect(screen.queryByLabelText('Product name, required')).toBeNull();
  await press('Details');
  expect(screen.getByLabelText('Product name, required')).toHaveDisplayValue('Keep my draft');
  await press('Back');
  await wait(400);
  await settle();
  await wait(400);
  expect(screen.getByText('Discard product edits?')).toBeVisible();
  await press('Keep editing');
  await wait(400);
  expect(currentPath()).toBe('/products/new');
  await press('Back');
  await wait(400);
  await press('Discard edits');
  await wait(400);
  expect(currentPath()).toBe('/products');
});

it('saves all detail fields while keeping current stock and HTML intact', async () => {
  await editorScreen();
  await type('Product name, required', 'Full edit from phone');
  await describe('<p>Text with <strong>bold</strong> markup.</p>');
  await type('Short description, Optional', 'Concise summary');
  await press('Search listing');
  await press('Edit search listing');
  await type('Search page title, Optional', 'Native search title');
  changeMockProduct('prod_vase', (product) => {
    product.stock.loc_main!.available -= 2;
  });
  await reviewSave();
  expect(await screen.findByRole('header', { name: 'Full edit from phone' })).toBeVisible();
  // Back on the page the editor came from, not on a second copy of it.
  expect(currentPath()).toBe('/products/prod_vase');
  await act(async () => router.back());
  await settle();
  expect(currentPath()).not.toBe('/products/prod_vase');
  const product = await endpoints.getProductEditor(
    { workspace: 'platform', locale: 'en' },
    'prod_vase'
  );
  expect(product.values.description).toBe('<p>Text with <strong>bold</strong> markup.</p>');
  expect(product.values.seo?.pageTitle).toBe('Native search title');
  expect(product.product.stock).toBe(22);
});

it('keeps local input during same-field conflict and saves only after an explicit choice', async () => {
  await editorScreen();
  await type('Product name, required', 'My edited product');
  changeMockProduct('prod_vase', (product) => {
    product.name = 'Concurrent store name';
  });
  await reviewSave();
  expect(screen.getByText('Someone changed this product')).toBeVisible();
  await press('Keep my changes and review');
  await wait(400);
  await press('Save product');
  await settle();
  expect(await screen.findByRole('header', { name: 'My edited product' })).toBeVisible();
});

it('takes the store values only for the fields both changed, keeping the other edits', async () => {
  await editorScreen();
  await type('Product name, required', 'My edited product');
  await type('Short description, Optional', 'Kept summary');
  changeMockProduct('prod_vase', (product) => {
    product.name = 'Concurrent store name';
  });
  await reviewSave();
  expect(screen.getByText('Someone changed this product')).toBeVisible();
  await press('Use current store values');
  await settle();

  expect(screen.getByLabelText('Product name, required')).toHaveDisplayValue(
    'Concurrent store name'
  );
  expect(screen.getByLabelText('Short description, Optional')).toHaveDisplayValue('Kept summary');
});

it('lets the operator leave an unconfirmed change and send the very same change again', async () => {
  await editorScreen();
  await type('Product name, required', 'Unconfirmed name');
  const save = unconfirmNextSave();
  await reviewSave();
  expect(screen.getByText('Change not confirmed')).toBeVisible();

  // Offline nothing goes, and the editor does not hold the operator.
  await act(async () => onlineManager.setOnline(false));
  await press('Send the same change again');
  await settle();
  expect(save).toHaveBeenCalledTimes(1);
  await press('Back');
  await settle();
  expect(currentPath()).toBe('/products/prod_vase');
  await act(async () => onlineManager.setOnline(true));

  // The draft and its change wait in the editor.
  await openEditor();
  expect(screen.getByText('Change not confirmed')).toBeVisible();
  expect(screen.getByLabelText('Product name, required')).toHaveDisplayValue('Unconfirmed name');
  await press('Send the same change again');
  await settle();

  expect(await screen.findByRole('header', { name: 'Unconfirmed name' })).toBeVisible();
  expect(currentPath()).toBe('/products/prod_vase');
  expect(save).toHaveBeenCalledTimes(2);
  const [first, again] = save.mock.calls;
  expect(again![4]).toBe(first![4]);
  expect(again![2]).toEqual(first![2]);
  expect(again![3]).toBe(first![3]);
});

it('does not hold the editor on a stopped upload the store never received', async () => {
  await editorScreen();
  await press('Media');
  jest
    .mocked(selectUploadFile)
    .mockImplementationOnce(async (_source, policy) =>
      selectedUploadFile(new Blob(['img'], { type: 'image/jpeg' }), 'photo.jpg', policy)
    );
  // The upload never reaches the store: it hangs until stopped.
  jest.spyOn(uploads, 'uploadFile').mockImplementation(
    (_scope, _request, _file, _name, _key, signal) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')));
      })
  );
  await press('Photo library');
  await settle();
  expect(screen.getByText('Uploading…')).toBeVisible();
  await press('Stop upload');
  await settle();
  expect(screen.getByText('Stopped — outcome not confirmed')).toBeVisible();

  await type('Product name, required', 'Saved without the photo');
  expect(screen.getAllByRole('button', { name: 'Review product' }).at(-1)).toBeEnabled();
  await press('Check upload status');
  await settle();
  expect(screen.getByText('Not received — nothing was saved')).toBeVisible();
  await press('Discard upload');
  await settle();
  expect(screen.queryByText('photo.jpg')).toBeNull();

  await press('Back');
  await wait(400);
  expect(screen.getByText('Discard product edits?')).toBeVisible();
});

it('says a saved display title can be changed but not removed', async () => {
  await editorScreen();
  await press('More details');
  await type('Display title, Optional', 'Gallery vase');
  await reviewSave();
  await screen.findByRole('header', { name: 'Ceramic bud vase' });

  await openEditor();
  await type('Display title, Optional', '');
  const hint =
    'Enter a title of 3 to 200 characters. A saved display title can be changed but not removed.';
  expect(screen.getByText(hint)).toBeVisible();
  const save = jest.spyOn(endpoints, 'saveFullProduct');
  await press('Review product');
  await wait(400);
  expect(screen.getByText('Check product fields')).toBeVisible();
  expect(save).not.toHaveBeenCalled();
});

it('confirms removing a variant once its sheet has closed, and Keep returns to it', async () => {
  await createScreen();
  await requiredFields();
  await press('Options and variants');
  await press('Add option');
  await type('Option 1 name', 'Size');
  await type('New value for option 1', 'Small, Large');
  await press('Add value to option 1');
  await press('Generate variants');
  await settle();

  await press('Edit variant: Small');
  await wait(400);
  await press('Remove variant');
  await wait(400);
  expect(screen.getByText('Remove this variant?')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Done editing variant' })).toBeNull();
  await press('Keep variant');
  await wait(400);
  expect(screen.getByRole('button', { name: 'Done editing variant' })).toBeVisible();

  await press('Remove variant');
  await wait(400);
  await press('Remove variant');
  await wait(400);
  expect(screen.queryByRole('button', { name: 'Edit variant: Small' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Edit variant: Large' })).toBeVisible();
});

it('recovers unknown creation without creating another product or initial inventory', async () => {
  await createScreen();
  await requiredFields();
  const original = endpoints.createFullProduct;
  const submit = jest
    .spyOn(endpoints, 'createFullProduct')
    .mockImplementationOnce(async (...args) => {
      const result = await original(...args);
      throw new ApiError(409, 'CONFLICT', '', {
        reason: 'OPERATION_RECONCILIATION_REQUIRED',
        details: { operation: { ...result.operation, state: 'unknown' } },
      });
    });
  await reviewSave('Create product');
  expect(screen.getByText('Change not confirmed')).toBeVisible();
  await press('Check original change');
  await settle();
  expect(await screen.findByRole('header', { name: 'Product from phone' })).toBeVisible();
  expect(submit).toHaveBeenCalledTimes(1);
  expect(allMockProducts().filter((product) => product.name === 'Product from phone')).toHaveLength(
    1
  );
});

it('frees the draft when the store has no record of an unanswered creation', async () => {
  await createScreen();
  await requiredFields();
  // The request never reaches the store, nor do its retries: no answer, and nothing recorded.
  const submit = jest
    .spyOn(endpoints, 'createFullProduct')
    .mockRejectedValue(new NetworkError('timeout'));
  await reviewSave('Create product');
  // The tap's own retries wait between tries.
  await wait(10_000);
  submit.mockRestore();
  await press('Check original change');
  await settle();

  expect(screen.getByText('Not saved')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Check original change' })).toBeNull();
  await reviewSave('Create product');
  expect(await screen.findByRole('header', { name: 'Product from phone' })).toBeVisible();
  expect(allMockProducts().filter((product) => product.name === 'Product from phone')).toHaveLength(
    1
  );
});

it('creates a digital product with private file uploads and server delivery settings', async () => {
  await createScreen();
  await requiredFields();
  await press('Format and shipping');
  await tap(screen.getByRole('radio', { name: 'Digital product' }));
  await press('Media');
  jest
    .mocked(selectUploadFile)
    .mockImplementationOnce(async (_source, policy) =>
      selectedUploadFile(
        new Blob(['private-content'], { type: 'application/pdf' }),
        'guide.pdf',
        policy
      )
    );
  await press('Add digital file');
  await settle();
  expect(screen.getByText('Digital files')).toBeVisible();
  await type('Download limit, Optional', '3');
  await reviewSave('Create product');
  expect(await screen.findByRole('header', { name: 'Product from phone' })).toBeVisible();
  const created = allMockProducts().find((product) => product.name === 'Product from phone')!;
  const product = await endpoints.getProductEditor(
    { workspace: 'platform', locale: 'en' },
    created.id
  );
  expect(product.values).toMatchObject({
    shipping: { isPhysicalProduct: false },
    digitalDelivery: { downloadLimit: 3 },
    digitalAssets: [{ filename: 'guide.pdf' }],
  });
  expect(JSON.stringify(product.values.digitalAssets)).not.toContain('/private/');
});

it('generates and edits option variants on the server before saving', async () => {
  await createScreen();
  await requiredFields();
  await press('Options and variants');
  await press('Add option');
  await type('Option 1 name', 'Size');
  await type('New value for option 1', 'Small');
  await press('Add value to option 1');
  await press('Generate variants');
  await settle();
  await press('Edit variant: Small');
  await wait(400);
  await type('Price, required', '15');
  await type('Variant initial stock, Optional', '2');
  await press('Done editing variant');
  await wait(400);
  await reviewSave('Create product');
  expect(await screen.findByRole('header', { name: 'Product from phone' })).toBeVisible();
  const product = allMockProducts().find((item) => item.name === 'Product from phone')!;
  expect(product.variants[0]).toMatchObject({ name: 'Small', price: 15 });
  expect(product.variants[0]?.stock.loc_main?.available).toBe(2);
});

it('hides creation and full editing for read-only staff', async () => {
  await signIn('staff@example.com');
  await openTab('Products');
  expect(screen.queryByRole('button', { name: 'Add product' })).toBeNull();
  await act(async () => router.push({ pathname: '/products/[id]', params: { id: 'prod_vase' } }));
  await settle();
  expect(screen.queryByRole('button', { name: 'Edit all product details' })).toBeNull();
});

it('confirms destructive deletion before performing its keyed action', async () => {
  await editorScreen();
  const send = jest.spyOn(endpoints, 'fullProductAction');
  await press('Delete product');
  await wait(400);
  expect(send).not.toHaveBeenCalled();
  await press('Delete product');
  await settle();
  await wait(400);
  expect(send).toHaveBeenCalledTimes(1);
  expect(allMockProducts().some((product) => product.id === 'prod_vase')).toBe(false);
  expect(currentPath()).toBe('/products');
});
