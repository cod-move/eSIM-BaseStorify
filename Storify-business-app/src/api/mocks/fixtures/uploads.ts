import type { UploadPolicy, UploadTarget } from '@/contracts/mobile/biz/v1';

import { seedOrders } from './orders';
import { seedProducts } from './products';

/** Mock-only target ownership; domain mocks can register newly created records. */
export type MockUploadTarget = {
  target: UploadTarget;
  vendorIds: (string | undefined)[];
  actorId?: string;
};

export function seedUploadTargets(): MockUploadTarget[] {
  return [
    ...seedProducts().map((product) => ({
      target: { kind: 'product' as const, id: product.id },
      vendorIds: [product.vendorId],
    })),
    ...seedOrders().map((order) => ({
      target: { kind: 'order' as const, id: order.id },
      vendorIds: order.consignments.map((part) => part.vendorId),
    })),
  ];
}

/** These are server fixture policies, never client fallback rules. */
export const MOCK_UPLOAD_POLICIES: Record<UploadPolicy['purpose'], UploadPolicy> = {
  product_media: {
    purpose: 'product_media',
    maxBytes: 4 * 1024 * 1024,
    maxFiles: 250,
    mimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
      'video/mp4',
      'video/webm',
      'model/gltf+json',
      'model/gltf-binary',
    ],
  },
  digital_asset: {
    purpose: 'digital_asset',
    maxBytes: 4 * 1024 * 1024,
    maxFiles: 20,
    mimeTypes: [],
  },
  digital_preview: {
    purpose: 'digital_preview',
    maxBytes: 4 * 1024 * 1024,
    maxFiles: 1,
    mimeTypes: [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
      'image/avif',
      'image/heic',
      'image/heif',
      'image/bmp',
      'image/tiff',
      'image/x-icon',
      'video/mp4',
      'video/webm',
      'video/ogg',
      'video/quicktime',
      'model/gltf-binary',
      'model/gltf+json',
      'application/octet-stream',
      'application/pdf',
    ],
  },
  return_evidence: {
    purpose: 'return_evidence',
    maxBytes: 4 * 1024 * 1024,
    maxFiles: 20,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  },
  return_label: {
    purpose: 'return_label',
    maxBytes: 4 * 1024 * 1024,
    maxFiles: 1,
    mimeTypes: ['image/jpeg', 'image/png', 'application/pdf'],
  },
};
