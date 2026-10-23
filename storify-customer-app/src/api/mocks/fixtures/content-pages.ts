/**
 * The mock store's About, Contact and return-policy pages: the website's
 * /about, /contact and /returns, as the store sends them field by field.
 */
import type {
  AboutPage,
  ContactMessageRequest,
  ContactMessageResult,
  ContactPage,
  ReturnPolicyPage,
  StoreContact,
} from '@/contracts/mobile/shop/v1';

import { picture } from './shared';

const storeContact: StoreContact = {
  address: {
    label: 'Head office',
    value: '221 Commerce Street, Dhaka 1212',
    href: 'https://www.google.com/maps/search/?api=1&query=221%20Commerce%20Street%2C%20Dhaka%201212',
  },
  email: { label: 'Email', value: 'help@example.com', href: 'mailto:help@example.com' },
  phone: { label: 'Phone', value: '+880 1700-000000', href: 'tel:+8801700000000' },
  hours: { label: 'Support hours', value: 'Saturday to Thursday, 9 am to 6 pm' },
  social: [
    { network: 'FACEBOOK', url: 'https://facebook.com/example' },
    { network: 'INSTAGRAM', url: 'https://instagram.com/example' },
  ],
};

export const aboutPage: AboutPage = {
  title: 'About us',
  eyebrow: 'Our story',
  headline: 'Good things, from people who care',
  description: 'We pick every product ourselves, and we answer every message.',
  image: picture('about-hero', 'Our team at the warehouse', 16 / 9),
  primaryAction: { label: 'Shop now', path: '/products' },
  secondaryAction: { label: 'Contact us', path: '/contact' },
  stats: [
    { id: 'products', label: 'Products', value: '1.2k' },
    { id: 'orders', label: 'Orders delivered', value: '8.4k' },
    { id: 'founded', label: 'Founded', value: '2019' },
  ],
  statsFootnote: 'Counted every few minutes.',
  howItWorks: {
    title: 'How it works',
    text: 'Three steps from browsing to your door.',
    shoppers: {
      title: 'For shoppers',
      items: [
        { id: 'step-1', title: 'Find it', text: 'Browse or search the catalogue.' },
        { id: 'step-2', title: 'Order it', text: 'Pay by card or on delivery.' },
        { id: 'step-3', title: 'Get it', text: 'Delivered in 3 to 7 working days.' },
      ],
    },
    protections: [
      { id: 'protect-1', title: 'Safe payments', text: 'Your card never touches our servers.' },
    ],
  },
  values: {
    title: 'What we care about',
    mission: 'Fair prices, honest descriptions, fast answers.',
    items: [
      {
        id: 'value-1',
        icon: 'TRUCK',
        title: 'Fast delivery',
        text: 'Most orders leave within a day.',
      },
      {
        id: 'value-2',
        icon: 'RETURNS',
        title: 'Easy returns',
        text: '30 days to change your mind.',
      },
    ],
  },
  story: {
    title: 'Our story',
    html: '<p>We started in a garage in 2019 with ten products. Read <a href="/faq">our FAQ</a> to learn more.</p>',
  },
  milestones: {
    title: 'Milestones',
    items: [
      { id: 'm-1', title: '2019', text: 'The first ten products.' },
      { id: 'm-2', title: '2023', text: 'Our own warehouse.' },
    ],
  },
  team: {
    title: 'The team',
    members: [
      {
        id: 'member-1',
        name: 'Mira Hossain',
        role: 'Founder',
        image: picture('mira', 'Mira Hossain'),
        url: 'https://example.com/mira',
      },
    ],
  },
  testimonials: {
    title: 'What shoppers say',
    items: [
      {
        id: 'review-1',
        rating: 5,
        comment: 'Arrived the next day, well packed.',
        reviewerName: 'Sara',
      },
    ],
  },
  contact: {
    title: 'Get in touch',
    text: 'We answer within a working day.',
    details: storeContact,
    action: { label: 'Contact us', path: '/contact' },
  },
  closing: {
    title: 'Ready to shop?',
    primaryAction: { label: 'Browse products', path: '/products' },
  },
};

export const contactPage: ContactPage = {
  title: 'Contact us',
  description: 'Questions about an order, a product or the store? Write to us.',
  image: picture('contact-hero', 'Our help desk', 16 / 9),
  intro: { title: 'Get in touch', text: 'Reach us the way that suits you.' },
  details: storeContact,
  form: { title: 'Send us a message', text: 'We answer within a working day.' },
  map: { title: 'Find us', label: 'Open in Maps', url: storeContact.address?.href ?? '' },
};

export const returnPolicyPage: ReturnPolicyPage = {
  title: 'Return and refund policy',
  eyebrow: 'Returns',
  description: 'Changed your mind? You can send most things back within 30 days of delivery.',
  primaryAction: { label: 'Start a return', path: '/account/orders' },
  secondaryAction: { label: 'Track an order', path: '/track-order' },
  window: { label: 'Return window', value: '30 days' },
  summary: ['Free returns on damaged items', 'Refunds to your original payment method'],
  howItWorks: {
    title: 'How returns work',
    items: [
      { id: 'step-1', title: 'Request it', text: 'Choose the items in your order.' },
      { id: 'step-2', title: 'Send it back', text: 'Pack them with all their parts.' },
      { id: 'step-3', title: 'Get refunded', text: 'Once we have checked them.' },
    ],
  },
  eligible: {
    title: 'What can be returned',
    items: [{ id: 'e-1', text: 'Unused items in their box' }],
  },
  excluded: { title: 'What cannot', items: [{ id: 'x-1', text: 'Gift cards and opened food' }] },
  statuses: {
    title: 'Where your return is',
    items: [
      { id: 's-1', title: 'Requested', text: 'We have your request.' },
      { id: 's-2', title: 'Refunded', text: 'The money is on its way.' },
    ],
  },
  beforeReturn: { title: 'Before you send it', text: 'Keep the receipt until the refund arrives.' },
  help: { title: 'Need help?', email: storeContact.email, phone: storeContact.phone },
  closing: {
    title: 'Something not right?',
    primaryAction: { label: 'See my orders', path: '/account/orders' },
  },
};

/**
 * What the mock store answers a message with: a conversation for a signed-in
 * shopper (`/account/inbox`), nothing for a guest. A message that says
 * "fail" is refused, so the form's error state can be seen.
 */
export function contactMessageResult(
  body: ContactMessageRequest,
  signedIn: boolean
): ContactMessageResult | 'refused' {
  if (body.message.toLowerCase().includes('fail')) return 'refused';
  return signedIn ? { conversationId: 'conv_contact' } : {};
}
