/** Endpoints: the shopper's eSIMs (the eSIM module, APP-03/04). */
import {
  EsimDestinationDetail,
  EsimDestinationList,
  EsimDetail,
  EsimDevices,
  EsimKyc,
  EsimKycFile,
  type EsimKycSubmitRequest,
  EsimReferralCode,
  EsimReferrals,
  EsimWallet,
  EsimList,
  EsimTopupQuote,
  EsimTopups,
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

/** The top-ups this eSIM can take now, priced. */
export function getEsimTopups(locale: string, id: string, signal: AbortSignal) {
  return api.data(
    { locale, path: `/me/esims/${encodeURIComponent(id)}/topups`, auth: 'user', signal },
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
