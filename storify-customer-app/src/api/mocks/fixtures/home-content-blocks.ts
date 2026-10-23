/** The mock Home's content blocks, spread into `homeBlocks` (home.ts): text, FAQ, pictures, promises. */
import type {
  BenefitsBlock,
  FaqBlock,
  ImageGalleryBlock,
  ImageTextBlock,
  RawHomeBlock,
  RichTextBlock,
} from '@/contracts/mobile/shop/v1';

import { picture } from './shared';

export const richTextBlock: RichTextBlock = {
  type: 'RICH_TEXT',
  id: 'about-us',
  heading: 'Our story',
  html: '<p>We started as a small stall and still pack every order by hand. Read more on <a href="/blog">our blog</a>.</p><ul><li>Made to last</li><li>Fairly priced</li></ul>',
};

export const imageTextBlock: ImageTextBlock = {
  type: 'IMAGE_TEXT',
  id: 'craft',
  image: picture('craft', 'A workshop table with tools', 4 / 3),
  imagePosition: 'START',
  heading: 'Made by hand',
  html: '<p>Every piece is finished by a person, not a machine.</p>',
  cta: { label: 'Meet the makers', href: '/vendors' },
};

export const imageGalleryBlock: ImageGalleryBlock = {
  type: 'IMAGE_GALLERY',
  id: 'community',
  title: 'From our community',
  images: [
    { id: 'g1', image: picture('community-1', 'A shopper with a new jacket') },
    { id: 'g2', image: picture('community-2', 'A table set with new plates') },
    { id: 'g3', image: picture('community-3', 'A reading corner') },
    { id: 'g4', image: picture('community-4', 'A balcony of plants') },
  ],
};

export const benefitsBlock: BenefitsBlock = {
  type: 'BENEFITS',
  id: 'promises',
  items: [
    { id: 'b1', icon: 'TRUCK', title: 'Free delivery', text: 'On orders over 1,000' },
    { id: 'b2', icon: 'RETURNS', title: 'Easy returns', text: 'Within 14 days' },
    { id: 'b3', icon: 'SHIELD', title: 'Secure payment' },
    { id: 'b4', icon: 'SUPPORT', title: 'Friendly support', text: 'Every day, 9 to 9' },
  ],
};

export const faqBlock: FaqBlock = {
  type: 'FAQ',
  id: 'questions',
  title: 'Questions',
  items: [
    { id: 'q1', question: 'How long does delivery take?', answer: 'Two to four working days.' },
    { id: 'q2', question: 'Can I return an order?', answer: 'Yes, within 14 days of delivery.' },
    {
      id: 'q3',
      question: 'Which payments do you take?',
      answer: 'Cards, mobile wallets and cash.',
    },
  ],
};

export const homeContentBlocks: RawHomeBlock[] = [
  richTextBlock,
  imageTextBlock,
  imageGalleryBlock,
  benefitsBlock,
  faqBlock,
];
