/** Endpoints: the shopper's eSIMs (the eSIM module, APP-03/04). */
import * as z from 'zod';

import {
  EsimDestinationDetail,
  EsimDestinationList,
  EsimDeleted,
  EsimDetail,
  EsimDevices,
  EsimKyc,
  EsimKycFile,
  type EsimKycSubmitRequest,
  EsimPlanDetails,
  EsimReferralCode,
  EsimReferralFriends,
  EsimReferrals,
  EsimRewards,
  EsimRewardsHistory,
  EsimRewardsRedeemResult,
  EsimRewardsTelegramLink,
  EsimWallet,
  EsimList,
  EsimTopupQuote,
  EsimTopups,
  EsimNumberActionResult,
  EsimNumberDataLimit,
  EsimNumberDetail,
  EsimNumberDiagnostics,
  EsimNumberForward,
  EsimNumberHistory,
  EsimNumberList,
  EsimNumberPrice,
  type EsimNumberPriceQuery,
  EsimNumberQuote,
  type EsimNumberQuoteRequest,
  EsimNumberReconnect,
  EsimNumberRemark,
  EsimNumberServices,
  EsimNumberShop,
  type EsimNumberShopQuery,
  EsimNumberStatement,
  type EsimNumberSwitch,
  EsimNumberSwitchResult,
  type EsimNumberTopupQuoteRequest,
} from '@/contracts/mobile/shop/v1/esim';

import { api, sendFile } from '../api';
import type { FormFile } from '../transport';

/** The shopper's eSIMs, newest first. */
export function getEsims(locale: string, signal: AbortSignal) {
  return api.data({ locale, path: '/me/esims', auth: 'user', signal }, EsimList);
}

/** One of the shopper's eSIMs, with how to install it. Another shopper's answers 404. */
export function getEsim(locale: string, id: string, signal: AbortSignal) {
  return api.data(
    { locale, path: `/me/esims/${encodeURIComponent(id)}`, auth: 'user', signal },
    EsimDetail
  );
}

/** Fresh usage from the supplier; within a minute of the last ask, what is stored. */
export function refreshEsim(locale: string, id: string) {
  return api.data(
    {
      locale,
      path: `/me/esims/${encodeURIComponent(id)}/refresh`,
      method: 'POST',
      auth: 'user',
      body: {},
    },
    EsimDetail
  );
}

/** Every destination on sale: countries, regions, global plans. The same for everybody. */
export function getEsimDestinations(locale: string, signal: AbortSignal) {
  return api.data({ locale, path: '/esim/destinations', signal }, EsimDestinationList);
}

/** One destination with its plans. `scope` is `local` for a country, `multi` for a region or global. */
export function getEsimDestination(
  locale: string,
  scope: 'local' | 'multi',
  slug: string,
  signal: AbortSignal
) {
  return api.data(
    {
      locale,
      path: `/esim/destinations/${scope}/${encodeURIComponent(slug)}`,
      signal,
    },
    EsimDestinationDetail
  );
}

/** One plan explained: what the website's plan details say, and where it works. */
export function getEsimPlanDetails(
  locale: string,
  scope: 'local' | 'multi',
  slug: string,
  variantId: string,
  signal: AbortSignal
) {
  return api.data(
    {
      locale,
      path: `/esim/destinations/${scope}/${encodeURIComponent(slug)}/plans/${encodeURIComponent(variantId)}`,
      signal,
    },
    EsimPlanDetails
  );
}

/** The top-ups this eSIM can take now, priced. */
/** The eSIM's top-ups: renewals of its own plan and the other areas; with `area`, that area's. */
export function getEsimTopups(locale: string, id: string, signal: AbortSignal, area?: string) {
  const query = area ? `?area=${encodeURIComponent(area)}` : '';
  return api.data(
    { locale, path: `/me/esims/${encodeURIComponent(id)}/topups${query}`, auth: 'user', signal },
    EsimTopups
  );
}

/** Fixes one top-up for the cart: the answer is the cart line to send as it is. */
export function quoteEsimTopup(locale: string, id: string, topupPlanId: string) {
  return api.data(
    {
      locale,
      path: `/me/esims/${encodeURIComponent(id)}/topups/quote`,
      method: 'POST',
      auth: 'user',
      body: { topupPlanId },
    },
    EsimTopupQuote
  );
}

/** Phones that take an eSIM, by brand. The same for everybody. */
export function getEsimDevices(locale: string, signal: AbortSignal) {
  return api.data({ locale, path: '/esim/devices', signal }, EsimDevices);
}

/** The shopper's balance and how to add to it. */
export function getEsimWallet(locale: string, signal: AbortSignal) {
  return api.data({ locale, path: '/me/esim-wallet', auth: 'user', signal }, EsimWallet);
}

/** The shopper's referral code, link, friends and rewards. */
export function getEsimReferrals(locale: string, signal: AbortSignal) {
  return api.data({ locale, path: '/me/esim-referrals', auth: 'user', signal }, EsimReferrals);
}

/** More of the friends who joined with the shopper's link, a page at a time (the first page comes with the centre). */
export function getEsimReferralFriends(locale: string, page: number, signal: AbortSignal) {
  return api.data(
    { locale, path: '/me/esim-referrals/friends', query: { page }, auth: 'user', signal },
    EsimReferralFriends
  );
}

/** The rewards centre (福利中心): the data balance, the Telegram link, what the data buys, every entry. */
export function getEsimRewards(locale: string, signal: AbortSignal) {
  return api.data({ locale, path: '/me/esim-rewards', auth: 'user', signal }, EsimRewards);
}

/** More of the rewards history, a page at a time (the first page comes with the centre). */
export function getEsimRewardsHistory(locale: string, page: number, signal: AbortSignal) {
  return api.data(
    { locale, path: '/me/esim-rewards/history', query: { page }, auth: 'user', signal },
    EsimRewardsHistory
  );
}

/** A one-time link that opens the check-in bot and links this account. */
export function linkEsimTelegram(locale: string) {
  return api.data(
    { locale, path: '/me/esim-rewards/telegram', method: 'POST', auth: 'user', body: {} },
    EsimRewardsTelegramLink
  );
}

/** Unlinks Telegram; the data saved stays. */
export function unlinkEsimTelegram(locale: string) {
  return api.data(
    { locale, path: '/me/esim-rewards/telegram', method: 'DELETE', auth: 'user' },
    z.object({ unlinked: z.boolean() })
  );
}

/** Spends saved data on an eSIM; `requestId` made per tap, so a retry spends once. */
export function redeemEsimReward(locale: string, itemId: string, requestId: string) {
  return api.data(
    {
      locale,
      path: '/me/esim-rewards/redeem',
      method: 'POST',
      auth: 'user',
      body: { itemId, requestId },
    },
    EsimRewardsRedeemResult
  );
}

/** Chooses another referral code; the store refuses one that is taken or malformed. */
export function setEsimReferralCode(locale: string, code: string) {
  return api.data(
    { locale, path: '/me/esim-referrals/code', method: 'PATCH', auth: 'user', body: { code } },
    EsimReferralCode
  );
}

/** Where the shopper stands with identity verification, and the form. */
export function getEsimKyc(locale: string, signal: AbortSignal) {
  return api.data({ locale, path: '/me/esim-kyc', auth: 'user', signal }, EsimKyc);
}

/** One document for a file question, stored privately until the form names it. */
export function uploadEsimKycFile(locale: string, field: string, file: FormFile) {
  return sendFile(
    { locale, path: '/me/esim-kyc/files', field: 'file', file, fields: { field } },
    EsimKycFile
  );
}

/** The answers, and the documents by the ids they were stored under. */
export function submitEsimKyc(locale: string, body: EsimKycSubmitRequest) {
  return api.data({ locale, path: '/me/esim-kyc', method: 'POST', auth: 'user', body }, EsimKyc);
}

/** Cancels an eSIM not installed yet; the answer is the eSIM as it now is. */
export function cancelEsim(locale: string, id: string) {
  return api.data(
    {
      locale,
      path: `/me/esims/${encodeURIComponent(id)}/cancel`,
      method: 'POST',
      auth: 'user',
      body: {},
    },
    EsimDetail
  );
}

/** Deletes the eSIM from the shopper's list; it is only hidden from them, not cancelled. */
export function deleteEsim(locale: string, id: string) {
  return api.data(
    { locale, path: `/me/esims/${encodeURIComponent(id)}`, method: 'DELETE', auth: 'user' },
    EsimDeleted
  );
}

// ── Phone numbers (NUM-03~09) ────────────────────────────────────────────

const numberPath = (id: string, rest = '') => `/me/esim-numbers/${encodeURIComponent(id)}${rest}`;

/** The numbers on sale, filtered, a page at a time. The same for everybody. */
export function getEsimNumberShop(locale: string, query: EsimNumberShopQuery, signal: AbortSignal) {
  return api.data({ locale, path: '/esim/numbers', query, signal }, EsimNumberShop);
}

/** What a choice comes to, in the card currency and as checkout charges it. The same for everybody. */
export function getEsimNumberPrice(
  locale: string,
  query: EsimNumberPriceQuery,
  signal: AbortSignal
) {
  return api.data({ locale, path: '/esim/numbers/price', query, signal }, EsimNumberPrice);
}

/** A number with its first credit and package, checked and priced: the cart line to send as it is. */
export function quoteEsimNumber(locale: string, body: EsimNumberQuoteRequest) {
  return api.data(
    { locale, path: '/me/esim-numbers/quote', method: 'POST', auth: 'user', body },
    EsimNumberQuote
  );
}

/** The shopper's numbers, newest first. */
export function getEsimNumbers(locale: string, signal: AbortSignal) {
  return api.data({ locale, path: '/me/esim-numbers', auth: 'user', signal }, EsimNumberList);
}

/** One of the shopper's numbers, read from the network first. Another shopper's answers 404. */
export function getEsimNumber(locale: string, id: string, signal: AbortSignal) {
  return api.data({ locale, path: numberPath(id), auth: 'user', signal }, EsimNumberDetail);
}

/** The shopper's own name for the number; empty clears it. */
export function setEsimNumberRemark(locale: string, id: string, remark: string) {
  return api.data(
    { locale, path: numberPath(id), method: 'PATCH', auth: 'user', body: { remark } },
    EsimNumberRemark
  );
}

/** The balance and packages from the network now; the answer is the number as it now is. */
export function refreshEsimNumber(locale: string, id: string) {
  return api.data(
    { locale, path: numberPath(id, '/refresh'), method: 'POST', auth: 'user', body: {} },
    EsimNumberDetail
  );
}

/** Stops one data package on the number; unused data is not refunded. */
export function cancelEsimNumberPacket(locale: string, id: string, packetId: string) {
  return api.data(
    {
      locale,
      path: numberPath(id, '/packets/cancel'),
      method: 'POST',
      auth: 'user',
      body: { packetId },
    },
    EsimNumberDetail
  );
}

/** Credit or a data package for the number: the cart line to send as it is. */
export function quoteEsimNumberTopup(
  locale: string,
  id: string,
  body: EsimNumberTopupQuoteRequest
) {
  return api.data(
    { locale, path: numberPath(id, '/topups/quote'), method: 'POST', auth: 'user', body },
    EsimNumberQuote
  );
}

export function getEsimNumberServices(locale: string, id: string, signal: AbortSignal) {
  return api.data(
    { locale, path: numberPath(id, '/services'), auth: 'user', signal },
    EsimNumberServices
  );
}

export function setEsimNumberService(
  locale: string,
  id: string,
  service: EsimNumberSwitch,
  on: boolean
) {
  return api.data(
    {
      locale,
      path: numberPath(id, '/services'),
      method: 'POST',
      auth: 'user',
      body: { service, on },
    },
    EsimNumberSwitchResult
  );
}

/** Forwards every call to `to` (with its country code), or stops forwarding with null. */
export function setEsimNumberForward(locale: string, id: string, to: string | null) {
  return api.data(
    { locale, path: numberPath(id, '/forward'), method: 'POST', auth: 'user', body: { to } },
    EsimNumberForward
  );
}

export function getEsimNumberDataLimit(locale: string, id: string, signal: AbortSignal) {
  return api.data(
    { locale, path: numberPath(id, '/data-limit'), auth: 'user', signal },
    EsimNumberDataLimit
  );
}

/** Sets the daily data limit in cents of the card currency, or removes it with null. */
export function setEsimNumberDataLimit(locale: string, id: string, valueMinor: number | null) {
  return api.data(
    {
      locale,
      path: numberPath(id, '/data-limit'),
      method: 'POST',
      auth: 'user',
      body: { valueMinor },
    },
    EsimNumberDataLimit
  );
}

export function getEsimNumberHistory(
  locale: string,
  id: string,
  days: number,
  signal: AbortSignal
) {
  return api.data(
    { locale, path: numberPath(id, '/history'), query: { days }, auth: 'user', signal },
    EsimNumberHistory
  );
}

export function getEsimNumberDiagnostics(locale: string, id: string, signal: AbortSignal) {
  return api.data(
    { locale, path: numberPath(id, '/diagnostics'), auth: 'user', signal },
    EsimNumberDiagnostics
  );
}

export function reconnectEsimNumber(locale: string, id: string) {
  return api.data(
    { locale, path: numberPath(id, '/reconnect'), method: 'POST', auth: 'user', body: {} },
    EsimNumberReconnect
  );
}

/** Posts one of the number's actions; `key` makes a repeat of the same one harmless. */
export function postEsimNumberAction(
  locale: string,
  id: string,
  action: 'sms' | 'transfer' | 'qr' | 'owner' | 'release' | 'voucher',
  body: Record<string, unknown>
) {
  return api.data(
    { locale, path: numberPath(id, `/${action}`), method: 'POST', auth: 'user', body },
    EsimNumberActionResult
  );
}

/** The phone bill for whole past months (`YYYY-MM`), as a PDF. */
export function getEsimNumberStatement(locale: string, id: string, from: string, to: string) {
  return api.data(
    { locale, path: numberPath(id, '/statement'), query: { from, to }, auth: 'user' },
    EsimNumberStatement
  );
}
