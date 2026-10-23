/** GET /me: who is signed in, and what they may do in each workspace; their picture. */
import {
  PICTURE_MAX_BYTES,
  PICTURE_TYPES,
  type Me,
  type WorkspaceAccess,
} from '@/contracts/mobile/biz/v1';

import { workspaceVendor, type MockAccount, type MockGrant } from '../fixtures/accounts';
import { accountOf, bodyOf, invalid, MockError, type MockRoute } from '../kit';
import { isMockMultipartFile, type MockMultipartFile } from '../multipart';

function accessOf(grant: MockGrant): WorkspaceAccess {
  return {
    workspace: grant.workspace,
    role: grant.role,
    capabilities: grant.capabilities,
    permissions: grant.permissions,
    scoped: grant.scoped,
    ...(grant.vendorId ? { vendor: workspaceVendor(grant.vendorId, grant.role) } : {}),
  };
}

export function meOf(account: MockAccount, current: MockGrant | null): Me {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    ...(account.imageUrl ? { imageUrl: account.imageUrl } : {}),
    role: account.role,
    isOwner: account.isOwner,
    twoFactorEnabled: Boolean(account.twoFactor),
    workspaces: account.grants.map(accessOf),
    ...(current ? { currentWorkspace: current.workspace } : {}),
  };
}

/**
 * The photo itself as the picture's address, so the preview shows the photo
 * chosen; the store keeps a file and answers its URL.
 */
function dataUrlOf(file: MockMultipartFile): string {
  let binary = '';
  for (let at = 0; at < file.bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...file.bytes.slice(at, at + 0x8000));
  }
  return `data:${file.mimeType};base64,${btoa(binary)}`;
}

/** The photo PUT /me/picture takes, refused as the store refuses one. */
function pictureOf(body: Record<string, unknown>): MockMultipartFile {
  const file = body.file;
  if (!isMockMultipartFile(file)) {
    throw invalid('file', 'Send one photo in the form field "file".', 'UPLOAD_MISSING');
  }
  const type = (file.mimeType.split(';')[0] ?? '').trim().toLowerCase();
  if (!(PICTURE_TYPES as readonly string[]).includes(type)) {
    throw invalid(
      'file',
      'Only photos can be uploaded (JPEG, PNG, GIF, WebP, AVIF or HEIC).',
      'UPLOAD_TYPE_NOT_ALLOWED'
    );
  }
  if (file.size > PICTURE_MAX_BYTES) {
    throw new MockError(413, 'VALIDATION_ERROR', 'Photos can be at most 8 MB.', {
      reason: 'UPLOAD_TOO_LARGE',
      errors: { file: ['Photos can be at most 8 MB.'] },
    });
  }
  return file;
}

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/me',
    access: 'account',
    handle: (ctx) => meOf(accountOf(ctx), ctx.grant),
  },
  {
    method: 'PUT',
    path: '/me/picture',
    access: 'account',
    handle: (ctx) => {
      const account = accountOf(ctx);
      account.imageUrl = dataUrlOf(pictureOf(bodyOf(ctx)));
      return meOf(account, ctx.grant);
    },
  },
  {
    method: 'DELETE',
    path: '/me/picture',
    access: 'account',
    handle: (ctx) => {
      const account = accountOf(ctx);
      account.imageUrl = undefined;
      return meOf(account, ctx.grant);
    },
  },
];
