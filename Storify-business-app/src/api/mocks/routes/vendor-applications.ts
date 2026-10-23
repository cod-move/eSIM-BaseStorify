/**
 * Sellers' applications: the list (tabs, search), one with its documents, and
 * the decision (keyed). Administrators only, in the platform workspace.
 */
import {
  VENDOR_APPLICATION_DECISIONS,
  VENDOR_APPLICATION_TABS,
  type VendorApplicationDetail,
  type VendorApplicationListItem,
} from '@/contracts/mobile/biz/v1';

import { seedApplications, type MockApplication } from '../fixtures/vendor-applications';
import {
  MOCK_ORIGIN,
  image,
  money,
  notFound,
  oneOf,
  pageOf,
  searchOf,
  textOf,
} from '../fixtures/shared';
import { MockError, bodyOf, invalid, type MockContext, type MockRoute } from '../kit';

let applications = seedApplications();

export function reset(): void {
  applications = seedApplications();
}

/** A document's link works for five minutes, as the store's signed links do. */
const DOCUMENT_MINUTES = 5;
/** The longest reason the store takes, as the contract's schema says. */
const REASON_MAX = 1000;

function listItemOf(application: MockApplication): VendorApplicationListItem {
  return {
    id: application.id,
    storeName: application.storeName,
    logo: image(`logo-${application.id}`, application.storeName),
    applicantName: application.applicantName,
    applicantEmail: application.applicantEmail,
    status: application.status,
    ...(application.submittedAt ? { submittedAt: application.submittedAt } : {}),
    ...(application.plan ? { planName: application.plan.name } : {}),
  };
}

function detailOf(application: MockApplication, locale: string): VendorApplicationDetail {
  const expiresAt = new Date(Date.now() + DOCUMENT_MINUTES * 60_000).toISOString();
  return {
    ...listItemOf(application),
    description: application.description,
    banner: image(`banner-${application.id}`, application.storeName),
    ...(application.address ? { address: application.address } : {}),
    ...(application.website ? { website: application.website } : {}),
    ...(application.taxId ? { taxId: application.taxId } : {}),
    documents: application.documents.map((document, index) => ({
      kind: document.kind,
      ...(document.label ? { label: document.label } : {}),
      url: `${MOCK_ORIGIN}/documents/${application.id}/${index}.pdf?expires=${encodeURIComponent(expiresAt)}`,
      expiresAt,
    })),
    answers: application.answers,
    ...(application.plan
      ? {
          plan: {
            name: application.plan.name,
            price: money(application.plan.price, locale),
            billingInterval: application.plan.billingInterval,
            trialDays: application.plan.trialDays,
          },
        }
      : {}),
    paymentStatus: application.paymentStatus,
    ...(application.decidedAt ? { decidedAt: application.decidedAt } : {}),
    ...(application.rejectionReason ? { rejectionReason: application.rejectionReason } : {}),
    canDecide: application.status === 'submitted',
  };
}

function applicationOf(id: string): MockApplication {
  const application = applications.find((candidate) => candidate.id === id);
  if (!application) throw notFound('Application');
  return application;
}

function decide(ctx: MockContext, application: MockApplication) {
  const body = bodyOf(ctx);
  const decision = body.decision;
  if (!(VENDOR_APPLICATION_DECISIONS as readonly unknown[]).includes(decision)) {
    throw new MockError(400, 'VALIDATION_ERROR', 'Approve or reject', {
      errors: { decision: [`Expected one of: ${VENDOR_APPLICATION_DECISIONS.join(', ')}`] },
    });
  }
  const reason = textOf(body, 'reason');
  // The schema checks the reason whatever the decision, though an approval ignores it.
  if (reason && reason.length > REASON_MAX) {
    throw invalid('reason', `Keep the reason to ${REASON_MAX} characters or fewer`);
  }
  if (decision === 'reject' && !reason) {
    throw new MockError(400, 'VALIDATION_ERROR', 'A rejection needs a reason', {
      reason: 'REASON_REQUIRED',
      errors: { reason: ['Required'] },
    });
  }
  if (application.status === 'approved' || application.status === 'rejected') {
    throw new MockError(409, 'CONFLICT', 'Somebody decided on this application first', {
      reason: 'ALREADY_DECIDED',
    });
  }
  if (application.status !== 'submitted') {
    throw new MockError(409, 'CONFLICT', 'The applicant has not finished applying', {
      reason: 'NOT_SUBMITTED',
    });
  }

  application.decidedAt = new Date().toISOString();
  if (decision === 'reject') {
    application.status = 'rejected';
    application.rejectionReason = reason ?? undefined;
    return { application: detailOf(application, ctx.locale) };
  }
  application.status = 'approved';
  // A paid plan without a free trial waits for its first payment.
  const waitsForPayment = Boolean(
    application.plan && application.plan.price > 0 && !application.plan.trialDays
  );
  if (waitsForPayment) application.paymentStatus = 'pending';
  return {
    application: detailOf(application, ctx.locale),
    vendorStatus: waitsForPayment ? 'payment_required' : 'approved',
  };
}

const REVIEW = { capability: 'REVIEW_VENDOR_APPLICATIONS', only: 'platform' } as const;

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/vendor-applications',
    access: REVIEW,
    handle: (ctx) => {
      const tab = oneOf(ctx.query, 'tab', VENDOR_APPLICATION_TABS) ?? 'pending';
      const search = searchOf(ctx.query);
      const rows = applications
        .filter((application) =>
          tab === 'all'
            ? true
            : tab === 'pending'
              ? application.status === 'submitted'
              : application.status === tab
        )
        .filter((application) => !search || application.storeName.toLowerCase().includes(search))
        // Pending: the one waiting longest first. The other tabs: newest first.
        .sort((a, b) => {
          const order = (a.submittedAt ?? '').localeCompare(b.submittedAt ?? '');
          return tab === 'pending' ? order : -order;
        });
      const page = pageOf(rows, ctx.query);
      return { ...page, items: page.items.map(listItemOf) };
    },
  },
  {
    method: 'POST',
    path: /^\/vendor-applications\/([^/]+)\/decision$/,
    access: REVIEW,
    idempotent: true,
    handle: (ctx, [id = '']) => decide(ctx, applicationOf(id)),
  },
  {
    method: 'GET',
    path: /^\/vendor-applications\/([^/]+)$/,
    access: REVIEW,
    handle: (ctx, [id = '']) => detailOf(applicationOf(id), ctx.locale),
  },
];
