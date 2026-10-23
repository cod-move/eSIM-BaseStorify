import {
  BizUpload,
  BizUploadAccess,
  BizUploadResult,
  OperationStatus,
  type Capability,
  type Workspace,
} from '@/contracts/mobile/biz/v1';

import { ACCOUNTS } from '../mocks/fixtures/accounts';
import { removeMockUploadTarget, storedMockUploadCount } from '../mocks/routes/uploads';
import { mockFetch, resetMockServer } from '../mocks/server';
import { API_BASE_PATH } from '@/contracts/mobile/biz/v1';

import { as, call, dataOf, keyed, ORIGIN, refusalOf } from './mock-helpers';

const KEY = '8dd83a46-f193-4e50-8d78-6a91e7e44c9b';
const OTHER_KEY = '92345a3b-7ad1-4d68-9f46-081bc039f881';
const restore: (() => void)[] = [];

beforeEach(resetMockServer);
afterEach(() => {
  for (const undo of restore.splice(0)) undo();
});

function grant(email: string, workspace: Workspace, capability: Capability): void {
  const access = ACCOUNTS.find((account) => account.email === email)?.grants.find(
    (entry) => entry.workspace === workspace
  );
  if (!access) throw new Error('Missing fixture access');
  const original = [...access.capabilities];
  if (!access.capabilities.includes(capability)) access.capabilities.push(capability);
  restore.push(() => {
    access.capabilities = original;
  });
}

function form(
  purpose = 'product_media',
  target = { kind: 'product', id: 'prod_towel' },
  text = 'photo-bytes',
  type = 'image/jpeg'
) {
  const body = new FormData();
  body.append('purpose', purpose);
  body.append('target', JSON.stringify(target));
  body.append('file', new Blob([text], { type }), 'photo.jpg');
  return body;
}

async function create(body: FormData, headers: Record<string, string>, key = KEY) {
  const response = await mockFetch(`${ORIGIN}${API_BASE_PATH}/en/uploads`, {
    method: 'POST',
    headers: keyed(headers, key),
    body,
  });
  return { response, body: await response.json() };
}

describe('contract-backed binary uploads', () => {
  it('accepts actual multipart bytes and replays one upload/operation per key', async () => {
    const headers = await as('seller@example.com', 'vendor');
    const first = await create(form(), headers);
    expect(first.response.status).toBe(200);
    const result = BizUploadResult.parse(first.body.data);
    expect(result.upload).toMatchObject({
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      size: 11,
      private: false,
    });
    expect(result.operation).toMatchObject({
      key: KEY,
      state: 'succeeded',
      resources: [{ kind: 'upload', id: result.upload.id }],
    });
    const replay = await create(form(), headers);
    expect(replay.response.headers.get('idempotent-replayed')).toBe('true');
    expect(replay.body).toEqual(first.body);
    expect(storedMockUploadCount()).toBe(1);
    await dataOf(BizUpload, `/uploads/${result.upload.id}`, { headers });
    await dataOf(OperationStatus, `/operations?key=${KEY}`, { headers });
    await refusalOf(404, 'NOT_FOUND', `/uploads/${result.upload.id}/access`, { headers });
  });

  it('includes binary content in the fingerprint when names, size and MIME match', async () => {
    const headers = await as('seller@example.com', 'vendor');
    await create(form('product_media', undefined, 'aaa'), headers);
    const different = await create(form('product_media', undefined, 'bbb'), headers);
    expect(different.response.status).toBe(422);
    expect(different.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(storedMockUploadCount()).toBe(1);
  });

  it('refuses JSON objects pretending to be binary multipart files and duplicate file fields', async () => {
    const headers = await as('seller@example.com', 'vendor');
    const json = await call('/uploads', {
      method: 'POST',
      headers: keyed(headers, KEY),
      body: {
        purpose: 'product_media',
        target: JSON.stringify({ kind: 'product', id: 'prod_towel' }),
        file: { filename: 'photo.jpg', mimeType: 'image/jpeg', size: 1, bytes: [1] },
      },
    });
    expect(json.response.status).toBe(400);
    const duplicate = form();
    duplicate.append('file', new Blob(['another'], { type: 'image/jpeg' }), 'other.jpg');
    expect((await create(duplicate, headers)).response.status).toBe(400);
    expect(storedMockUploadCount()).toBe(0);
  });

  it('applies the server byte/MIME policy and refuses unsupported purpose-target pairs', async () => {
    const headers = await as('seller@example.com', 'vendor');
    const tooLarge = form();
    tooLarge.set(
      'file',
      new Blob([new Uint8Array(4 * 1024 * 1024 + 1)], { type: 'image/jpeg' }),
      'big.jpg'
    );
    expect((await create(tooLarge, headers)).body.reason).toBe('UPLOAD_TOO_LARGE');
    expect(
      (await create(form('product_media', undefined, 'file', 'application/x-executable'), headers))
        .body.reason
    ).toBe('UPLOAD_TYPE_NOT_ALLOWED');
    expect(
      (
        await create(
          form('return_label', { kind: 'order', id: 'ord_1040' }, 'file', 'image/webp'),
          headers
        )
      ).body.reason
    ).toBe('UPLOAD_TYPE_NOT_ALLOWED');
    grant('seller@example.com', 'vendor', 'HANDLE_RETURNS');
    expect((await create(form('return_evidence'), headers)).body.reason).toBe(
      'UPLOAD_TARGET_CHANGED'
    );
    expect(storedMockUploadCount()).toBe(0);
  });

  it('protects private access, refreshes expiration and reauthorizes reconciliation', async () => {
    const headers = await as('seller@example.com', 'vendor');
    const result = BizUploadResult.parse(
      (
        await create(
          form('digital_asset', undefined, 'private-file', 'application/octet-stream'),
          headers
        )
      ).body.data
    );
    expect(result.upload.private).toBe(true);
    expect(result.upload.url).toBeUndefined();
    const first = await dataOf(BizUploadAccess, `/uploads/${result.upload.id}/access`, { headers });
    const next = await dataOf(BizUploadAccess, `/uploads/${result.upload.id}/access`, { headers });
    expect(first.url).not.toBe(next.url);
    expect(Date.parse(next.expiresAt)).toBeGreaterThan(Date.now());
    await refusalOf(404, 'NOT_FOUND', `/uploads/${result.upload.id}/access`, {
      headers: await as('admin@example.com', 'platform'),
    });
    await refusalOf(404, 'NOT_FOUND', `/operations?key=${KEY}`, {
      headers: await as('admin@example.com', 'platform'),
    });
    const access = ACCOUNTS.find((account) => account.email === 'seller@example.com')!.grants[0]!;
    const original = [...access.capabilities];
    access.capabilities = access.capabilities.filter(
      (capability) => capability !== 'EDIT_PRODUCTS'
    );
    restore.push(() => {
      access.capabilities = original;
    });
    await refusalOf(403, 'AUTHORIZATION_ERROR', `/operations?key=${KEY}`, { headers });
    const replay = await create(
      form('digital_asset', undefined, 'private-file', 'application/octet-stream'),
      headers
    );
    expect(replay.response.status).toBe(403);
    expect(replay.response.headers.get('idempotent-replayed')).toBeNull();
    // Viewing still permits the private file; reconciliation requires the original write grant.
    await dataOf(BizUploadAccess, `/uploads/${result.upload.id}/access`, { headers });
    removeMockUploadTarget({ kind: 'product', id: 'prod_towel' });
    await refusalOf(404, 'NOT_FOUND', `/uploads/${result.upload.id}/access`, { headers });
    access.capabilities = original;
    expect(
      (
        await create(
          form('digital_asset', undefined, 'private-file', 'application/octet-stream'),
          headers
        )
      ).response.status
    ).toBe(404);
  });

  it('keeps drafts creator-bound and cannot replay another workspace with the same key', async () => {
    grant('seller@example.com', 'vendor', 'CREATE_PRODUCTS');
    grant('seller-staff@example.com', 'vendor', 'CREATE_PRODUCTS');
    const seller = await as('seller@example.com', 'vendor');
    const result = BizUploadResult.parse(
      (
        await create(
          form(
            'digital_asset',
            { kind: 'product_draft', id: OTHER_KEY },
            'private',
            'application/octet-stream'
          ),
          seller
        )
      ).body.data
    );
    await refusalOf(404, 'NOT_FOUND', `/uploads/${result.upload.id}`, {
      headers: await as('seller-staff@example.com', 'vendor'),
    });
    grant('both@example.com', 'platform', 'EDIT_PRODUCTS');
    grant('both@example.com', 'vendor', 'EDIT_PRODUCTS');
    const platform = await as('both@example.com', 'platform');
    const vendor = { ...platform, 'X-Workspace': 'vendor' };
    const a = BizUploadResult.parse((await create(form(), platform)).body.data);
    const b = BizUploadResult.parse((await create(form(), vendor)).body.data);
    expect(a.upload.id).not.toBe(b.upload.id);
    expect(
      (await dataOf(OperationStatus, `/operations?key=${KEY}`, { headers: vendor })).resources[0]
        ?.id
    ).toBe(b.upload.id);
  });

  it('refuses targets outside the seller scope and validates operation lookups', async () => {
    const headers = await as('seller@example.com', 'vendor');
    expect((await create(form(), headers, 'invalid-key')).response.status).toBe(400);
    expect(
      (await create(form('product_media', { kind: 'product', id: 'prod_vase' }), headers)).response
        .status
    ).toBe(404);
    await refusalOf(400, 'VALIDATION_ERROR', '/operations?key=bad-key', { headers });
    await refusalOf(404, 'NOT_FOUND', `/operations?key=${OTHER_KEY}`, { headers });
  });
});
