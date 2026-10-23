/**
 * The mock store's conversations with customers: the store's own, and Green
 * Leaf Goods'. Between them they show a live chat with unread messages, a
 * WhatsApp thread past its 24-hour reply window, a closed one, a resolved
 * one, a team note, one assigned to a seller's staff member, and attachments
 * (one the app can open, two only the website can), and a shared product
 * the store no longer has.
 */
import type { ConversationMessage } from '@/contracts/mobile/biz/v1';

import { ACCOUNTS } from './accounts';
import { daysAgo, hoursAgo, minutesAgo } from './shared';

export type MockConversation = {
  id: string;
  /** The seller it belongs to; left out for the store's own. */
  vendorId?: string;
  channel: string;
  subject: string;
  status: string;
  contact: { name: string; email?: string; phone?: string };
  productId?: string;
  /** Who in the team has it: an account's id (fixtures/accounts.ts). */
  assigneeId?: string;
  unreadCount: number;
  replyWindowEndsAt?: string;
  createdAt: string;
  /** Oldest first. */
  messages: ConversationMessage[];
};

const message = (
  id: string,
  direction: 'inbound' | 'outbound' | 'internal',
  senderName: string,
  body: string,
  createdAt: string,
  extra: Partial<ConversationMessage> = {}
): ConversationMessage => ({
  id,
  direction,
  senderType: direction === 'inbound' ? 'customer' : 'admin',
  senderName,
  // The team's own messages name their writer's account, as the store's do.
  ...(direction === 'inbound'
    ? {}
    : { senderId: ACCOUNTS.find((account) => account.name === senderName)?.id }),
  body,
  attachments: [],
  deliveryStatus: direction === 'inbound' ? 'delivered' : 'read',
  createdAt,
  ...extra,
});

/** A fresh copy of the conversations. */
export function seedConversations(): MockConversation[] {
  return [
    {
      id: 'conv_store_1',
      channel: 'web',
      subject: 'Ceramic bud vase',
      status: 'open',
      contact: { name: 'Rina Begum', email: 'rina@example.com' },
      productId: 'prod_vase',
      unreadCount: 2,
      createdAt: hoursAgo(3),
      messages: [
        message(
          'msg_s1_1',
          'inbound',
          'Rina Begum',
          'Hello! Is the ceramic vase still available?',
          hoursAgo(3)
        ),
        message('msg_s1_2', 'outbound', 'Amina Rahman', 'Yes, we have 18 in stock.', hoursAgo(2)),
        message(
          'msg_s1_3',
          'internal',
          'Amina Rahman',
          'Offer free gift wrap if she orders two.',
          hoursAgo(2),
          {
            senderType: 'admin',
          }
        ),
        message('msg_s1_4', 'inbound', 'Rina Begum', 'Great. Do you gift wrap?', minutesAgo(45)),
        message(
          'msg_s1_5',
          'inbound',
          'Rina Begum',
          'Here is the colour I am after.',
          minutesAgo(40),
          {
            attachments: [
              {
                type: 'image',
                url: 'https://picsum.photos/seed/vase-colour/640',
                name: 'colour.jpg',
                mimeType: 'image/jpeg',
                size: 84213,
              },
            ],
          }
        ),
      ],
    },
    {
      id: 'conv_store_2',
      channel: 'whatsapp',
      subject: 'Delivery time',
      status: 'open',
      contact: { name: 'Jamal Uddin', phone: '+8801711000007' },
      unreadCount: 0,
      // The 24-hour window closed yesterday: a template from the website now.
      replyWindowEndsAt: daysAgo(1),
      createdAt: daysAgo(3),
      messages: [
        message('msg_s2_1', 'inbound', 'Jamal Uddin', 'When will my order arrive?', daysAgo(2), {
          webOnlyAttachments: 2,
        }),
        message(
          'msg_s2_2',
          'outbound',
          'Sadia Karim',
          'It ships today, you will get a text.',
          daysAgo(2),
          {
            senderType: 'staff',
          }
        ),
      ],
    },
    {
      id: 'conv_store_3',
      channel: 'web',
      subject: 'Wholesale enquiry',
      status: 'closed',
      contact: { name: 'Mehedi Hasan', email: 'mehedi@example.com' },
      unreadCount: 0,
      createdAt: daysAgo(9),
      messages: [
        message('msg_s3_1', 'inbound', 'Mehedi Hasan', 'Do you sell wholesale?', daysAgo(9)),
        // A product the store no longer has: its card is not a way to it.
        message('msg_s3_p', 'inbound', 'Mehedi Hasan', 'Like this one', daysAgo(9), {
          product: { id: 'prod_gone', name: 'Terracotta planter' },
        }),
        message('msg_s3_2', 'outbound', 'Amina Rahman', 'Not at the moment, sorry.', daysAgo(8)),
      ],
    },
    {
      id: 'conv_green_1',
      vendorId: 'vendor_green',
      channel: 'web',
      subject: 'Order #1040',
      status: 'open',
      contact: { name: 'Omar Faruk', email: 'omar@example.com' },
      productId: 'prod_mug',
      assigneeId: 'user_seller_staff',
      unreadCount: 1,
      createdAt: daysAgo(1),
      messages: [
        message(
          'msg_g1_1',
          'inbound',
          'Omar Faruk',
          'Can I change the delivery address?',
          daysAgo(1)
        ),
        message(
          'msg_g1_2',
          'outbound',
          'Nadia Chowdhury',
          'Of course, what is the new one?',
          hoursAgo(20),
          {
            senderType: 'vendor',
          }
        ),
        message('msg_g1_3', 'inbound', 'Omar Faruk', '7 Station Road, Chattogram.', hoursAgo(1)),
      ],
    },
    {
      id: 'conv_green_2',
      vendorId: 'vendor_green',
      channel: 'messenger',
      subject: 'Candle scents',
      status: 'resolved',
      contact: { name: 'Shirin Akter' },
      productId: 'prod_candle',
      unreadCount: 0,
      replyWindowEndsAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      createdAt: daysAgo(4),
      messages: [
        message('msg_g2_1', 'inbound', 'Shirin Akter', 'Do the candles come scented?', daysAgo(4)),
        message(
          'msg_g2_2',
          'outbound',
          'Nadia Chowdhury',
          'They are unscented beeswax.',
          daysAgo(4),
          {
            senderType: 'vendor',
            deliveryStatus: 'failed',
            error: 'Messenger refused the message: the page token expired.',
          }
        ),
      ],
    },
  ];
}
