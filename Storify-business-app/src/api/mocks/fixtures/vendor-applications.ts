/**
 * Sellers' applications to open a shop. An application is the seller's shop
 * while it waits for a decision, so its id is the shop's.
 */
import { daysAgo, hoursAgo } from './shared';

export type MockApplication = {
  id: string;
  storeName: string;
  applicantName: string;
  applicantEmail: string;
  /** `submitted`, `approved`, `rejected`, `suspended`, `draft` … */
  status: string;
  submittedAt?: string;
  description: string;
  address?: { street?: string; city?: string; country?: string; phone?: string };
  website?: string;
  taxId?: string;
  documents: { kind: string; label?: string }[];
  answers: { label: string; value: string; checked?: boolean }[];
  plan?: { name: string; price: number; billingInterval: string; trialDays: number };
  paymentStatus: string;
  decidedAt?: string;
  rejectionReason?: string;
};

/** A fresh copy of the applications. */
export function seedApplications(): MockApplication[] {
  return [
    {
      id: 'vendor_sunrise',
      storeName: 'Sunrise Bakery',
      applicantName: 'Ayesha Siddika',
      applicantEmail: 'ayesha@sunrise.example',
      status: 'submitted',
      submittedAt: hoursAgo(5),
      description: 'Small-batch sourdough, cakes and biscuits, baked every morning.',
      address: { street: '22 Baker Lane', city: 'Dhaka', country: 'BD', phone: '+8801711000101' },
      website: 'https://sunrise.example',
      taxId: 'TIN-4419-2201',
      documents: [
        { kind: 'business_license' },
        { kind: 'government_id' },
        { kind: 'food_permit', label: 'Food safety permit' },
      ],
      answers: [
        { label: 'How many products will you list?', value: '25' },
        { label: 'Do you ship nationwide?', value: 'No', checked: false },
      ],
      paymentStatus: 'not_required',
    },
    {
      id: 'vendor_pixel',
      storeName: 'Pixel Prints',
      applicantName: 'Rashed Khan',
      applicantEmail: 'rashed@pixelprints.example',
      status: 'submitted',
      submittedAt: daysAgo(2),
      description: 'Art prints and posters from local illustrators.',
      address: { city: 'Chattogram', country: 'BD' },
      documents: [{ kind: 'business_license' }, { kind: 'tax_certificate' }],
      answers: [{ label: 'Do you ship nationwide?', value: 'Yes', checked: true }],
      plan: { name: 'Pro', price: 29, billingInterval: 'monthly', trialDays: 14 },
      paymentStatus: 'unpaid',
    },
    {
      id: 'vendor_draft',
      storeName: 'Clay & Kiln',
      applicantName: 'Nabila Haque',
      applicantEmail: 'nabila@claykiln.example',
      status: 'draft',
      description: 'Hand-thrown pottery.',
      documents: [],
      answers: [],
      paymentStatus: 'not_required',
    },
    {
      id: 'vendor_green',
      storeName: 'Green Leaf Goods',
      applicantName: 'Nadia Chowdhury',
      applicantEmail: 'seller@example.com',
      status: 'approved',
      submittedAt: daysAgo(120),
      description: 'Natural homeware: linen, stoneware and beeswax.',
      documents: [{ kind: 'business_license' }],
      answers: [],
      paymentStatus: 'not_required',
      decidedAt: daysAgo(118),
    },
    {
      id: 'vendor_harbor',
      storeName: 'Blue Harbor Crafts',
      applicantName: 'Imran Siddiqui',
      applicantEmail: 'unpaid-seller@example.com',
      status: 'approved',
      submittedAt: daysAgo(6),
      description: 'Seagrass and jute baskets.',
      documents: [{ kind: 'government_id' }],
      answers: [],
      plan: { name: 'Starter', price: 9, billingInterval: 'monthly', trialDays: 0 },
      paymentStatus: 'pending',
      decidedAt: daysAgo(5),
    },
    {
      id: 'vendor_rejected',
      storeName: 'Quick Gadgets',
      applicantName: 'Sohel Rana',
      applicantEmail: 'sohel@quick.example',
      status: 'rejected',
      submittedAt: daysAgo(30),
      description: 'Phone accessories.',
      documents: [],
      answers: [],
      paymentStatus: 'not_required',
      decidedAt: daysAgo(29),
      rejectionReason: 'The business licence was missing.',
    },
  ];
}
