import { onlineManager } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { isApiError } from '@/api/errors';
import { AlreadySending, AttemptAbandoned } from '@/api/keyed-mutation';
import { AppImage } from '@/components/ui/app-image';
import { LogoTile } from '@/components/ui/avatar';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Price } from '@/components/ui/price';
import { GroupFootnote, RowGroup, SectionLabel, ValueRow } from '@/components/ui/rows';
import { ActionBar, Screen, StackHeader } from '@/components/ui/screen';
import { ConfirmSheet, ReasonSheet } from '@/components/ui/sheet';
import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import {
  VendorApplicationDecisionRequest,
  type VendorApplicationDecisionResult,
  type VendorApplicationDetail,
  type VendorApplicationDocument,
} from '@/contracts/mobile/biz/v1';
import { ApplicationStatusChip } from '@/features/status/status-chip';
import { storeWord } from '@/features/status/status-tone';
import { useOpenPage } from '@/features/web/use-open-page';
import { useErrorMessage } from '@/i18n/use-error-message';
import { isAhead, useDateTime } from '@/i18n/use-list-time';
import { usePullToRefresh } from '@/lib/use-pull-to-refresh';

import { useVendorApplication, useVendorApplicationDecision } from './use-vendor-applications';

const BILLING = ['monthly', 'yearly', 'none'] as const;
const PAYMENT = [
  'not_required',
  'unpaid',
  'pending',
  'paid',
  'failed',
  'expired',
  'refunded',
] as const;
const DOCUMENTS = ['business_license', 'tax_certificate', 'government_id'] as const;
/** The longest reason the store takes (the contract's). */
const REASON_MAX = VendorApplicationDecisionRequest.shape.reason.unwrap().maxLength;

/** A link this close to its end is taken as run out: it could stop while the page loads. */
const LINK_MARGIN_MS = 15_000;

/** Whether a document's link still has time left, by the phone's clock (read when tapped). */
function linkStillOpen(document: VendorApplicationDocument): boolean {
  return isAhead(document.expiresAt, Date.now() + LINK_MARGIN_MS);
}

/**
 * One seller's application, for an administrator to
 * decide on: the shop, the applicant, the plan, the documents (opened through
 * links that last minutes) and the store's own questions; Approve and Reject
 * while the store would take a decision, each asking first.
 */
export function ApplicationScreen({ id }: { id: string }) {
  const t = useTranslations('applications');
  const titles = useTranslations('shell.titles');
  const common = useTranslations('common');
  const describe = useErrorMessage();
  const toast = useToast();
  const query = useVendorApplication(id);
  const decision = useVendorApplicationDecision(id);
  const pull = usePullToRefresh(query.refetch);
  const [asking, setAsking] = useState<'approve' | 'reject' | null>(null);
  // Already decided (409): said at the top until the screen closes.
  const [alreadyDecided, setAlreadyDecided] = useState(false);
  const application = query.data;
  const header = <StackHeader title={application?.storeName ?? titles('application')} />;

  if (!application) {
    return (
      <Screen header={header}>
        {query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <LoadingState shape="spinner" />
        )}
      </Screen>
    );
  }

  const outcome = (result: VendorApplicationDecisionResult) => {
    const shop = result.application.storeName;
    if (result.application.status === 'rejected') return t('rejected');
    if (result.vendorStatus === 'payment_required') return t('approvedPayment', { shop });
    if ((result.application.plan?.trialDays ?? 0) > 0) return t('approvedTrial', { shop });
    return t('approved', { shop });
  };

  const decide = async (request: VendorApplicationDecisionRequest) => {
    // Offline nothing is sent: the sheet stays, to be confirmed again.
    if (!onlineManager.isOnline()) {
      toast.show({ message: common('notSentOffline'), tone: 'offline' });
      return;
    }
    // A reason the store would refuse is not sent: the sheet keeps the words to shorten.
    if (REASON_MAX && (request.reason?.length ?? 0) > REASON_MAX) {
      toast.show({ message: t('rejectSheet.tooLong', { max: REASON_MAX }), tone: 'danger' });
      return;
    }
    try {
      const result = await decision.submit(request);
      setAsking(null);
      toast.show({ message: outcome(result), tone: 'success' });
    } catch (error) {
      if (error instanceof AlreadySending) return;
      // The operator who tapped signed out before its next try: it was theirs, and
      // whoever signs in next is told nothing of it.
      if (error instanceof AttemptAbandoned) return;
      if (isApiError(error) && error.reason === 'ALREADY_DECIDED') {
        // Somebody else, or this operator's own earlier tap whose answer was lost:
        // the hook reads the application again, and the screen shows it as it now is.
        setAsking(null);
        setAlreadyDecided(true);
        return;
      }
      // The application moved on (403, 404, 409): the sheet closes. A 400 is about
      // what was typed, and with no answer the same tap's key is kept: it stays.
      if (isApiError(error) && error.status !== 400) setAsking(null);
      toast.show({ message: describe(error), tone: 'danger' });
    }
  };

  const shop = application.storeName;
  const applicant = application.applicantName;

  return (
    <>
      <Screen
        header={header}
        scroll
        refreshing={pull.refreshing}
        onRefresh={pull.onRefresh}
        contentClassName="gap-6 px-4 pt-2"
        footer={
          application.canDecide ? (
            <ActionBar>
              <View className="flex-row gap-3">
                <Button
                  label={t('approve')}
                  variant="accent"
                  className="flex-1"
                  disabled={decision.isPending}
                  onPress={() => setAsking('approve')}
                />
                <Button
                  label={t('reject')}
                  variant="secondary"
                  className="flex-1"
                  disabled={decision.isPending}
                  onPress={() => setAsking('reject')}
                />
              </View>
            </ActionBar>
          ) : undefined
        }>
        {alreadyDecided ? <Banner tone="warning" message={t('detail.alreadyDecided')} /> : null}
        <Summary application={application} />
        <About application={application} />
        <Applicant application={application} />
        <Plan application={application} />
        <Documents application={application} refetch={query.refetch} />
        <Answers application={application} />
        <Decision application={application} />
      </Screen>

      {/* After the screen, so the sheets' steps come after the bar's (in reading order too). */}
      <ConfirmSheet
        visible={asking === 'approve'}
        title={t('approveSheet.title', { shop })}
        body={t('approveSheet.body', { applicant })}
        confirmLabel={t('approveSheet.confirm')}
        cancelLabel={t('approveSheet.cancel')}
        loading={decision.isPending}
        onCancel={() => setAsking(null)}
        onConfirm={() => void decide({ decision: 'approve' })}
      />
      <ReasonSheet
        visible={asking === 'reject'}
        title={t('rejectSheet.title', { shop })}
        body={t('rejectSheet.body', { applicant })}
        noteLabel={t('rejectSheet.reason')}
        confirmLabel={t('rejectSheet.confirm')}
        cancelLabel={t('rejectSheet.cancel')}
        tone="danger"
        loading={decision.isPending}
        onCancel={() => setAsking(null)}
        onConfirm={({ note }) => void decide({ decision: 'reject', reason: note })}
      />
    </>
  );
}

type SectionProps = { application: VendorApplicationDetail };

/** The shop at a glance: its banner and logo, its name, when it applied, where it stands. */
function Summary({ application }: SectionProps) {
  const t = useTranslations('applications');
  const dateTime = useDateTime();
  const applied = application.submittedAt
    ? t('applied', { date: dateTime(application.submittedAt) })
    : null;

  return (
    <View className="overflow-hidden rounded-xl bg-surface">
      {application.banner ? (
        <AppImage
          image={application.banner}
          size="card"
          decorative
          aspectRatio={3}
          className="w-full bg-surface-alt"
        />
      ) : null}
      <View className="flex-row items-center gap-3 p-4">
        <LogoTile logo={application.logo} size="lg" />
        <View className="flex-1 gap-1">
          <Text variant="heading">{application.storeName}</Text>
          {applied ? <Text variant="meta">{applied}</Text> : null}
        </View>
        <ApplicationStatusChip status={application.status} />
      </View>
    </View>
  );
}

function About({ application }: SectionProps) {
  const t = useTranslations('applications.detail');
  if (!application.description.trim()) return null;

  return (
    <View>
      <SectionLabel title={t('about')} />
      <View className="rounded-xl bg-surface px-4 py-3">
        <Text variant="long" selectable>
          {application.description}
        </Text>
      </View>
    </View>
  );
}

/** Who applied, and how to reach them. */
function Applicant({ application }: SectionProps) {
  const t = useTranslations('applications.detail');
  const common = useTranslations('common');
  const openPage = useOpenPage();
  const { address, website, taxId } = application;
  const place = [
    address?.street,
    address?.city,
    address?.state,
    address?.postalCode,
    address?.country,
  ]
    .filter(Boolean)
    .join(common('listSeparator'));

  return (
    <View>
      <SectionLabel title={t('applicant')} />
      <RowGroup>
        <ValueRow label={t('name')} value={application.applicantName} />
        <ValueRow label={t('email')} value={application.applicantEmail} />
        {address?.phone ? <ValueRow label={t('phone')} value={address.phone} /> : null}
        {place ? <ValueRow label={t('address')} value={place} /> : null}
        {website ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`${t('website')}, ${website}`}
            onPress={() => openPage(/^https?:\/\//i.test(website) ? website : `https://${website}`)}
            className="active:bg-surface-alt">
            <ValueRow
              label={t('website')}
              value={
                <Text className="text-link" numberOfLines={1}>
                  {website}
                </Text>
              }
              valueLabel={website}
            />
          </Pressable>
        ) : null}
        {taxId ? <ValueRow label={t('taxId')} value={taxId} /> : null}
      </RowGroup>
    </View>
  );
}

/** The plan applied for: its price, billing, free days and its first payment, in words. */
function Plan({ application }: SectionProps) {
  const t = useTranslations('applications');
  const { plan } = application;
  if (!plan) return null;
  const billing = BILLING.find((known) => known === plan.billingInterval);
  const payment = PAYMENT.find((known) => known === application.paymentStatus);

  return (
    <View>
      <SectionLabel title={t('detail.plan')} />
      <RowGroup>
        <ValueRow label={t('detail.planName')} value={plan.name} />
        <ValueRow
          label={t('detail.price')}
          value={<Price money={plan.price} />}
          valueLabel={plan.price.formatted}
        />
        <ValueRow
          label={t('detail.billing')}
          value={billing ? t(`billing.${billing}`) : storeWord(plan.billingInterval)}
        />
        {plan.trialDays > 0 ? (
          <ValueRow
            label={t('detail.trial')}
            value={t('detail.trialDays', { count: plan.trialDays })}
          />
        ) : null}
        <ValueRow
          label={t('detail.firstPayment')}
          value={payment ? t(`payment.${payment}`) : storeWord(application.paymentStatus)}
        />
      </RowGroup>
    </View>
  );
}

/**
 * The documents, each opened through a link that lasts minutes. A link that
 * has run out (or is about to) is replaced first: the application is read
 * again and the same document's new link opens.
 */
function Documents({
  application,
  refetch,
}: SectionProps & {
  refetch: () => Promise<{ data?: VendorApplicationDetail; isError: boolean; error: unknown }>;
}) {
  const t = useTranslations('applications');
  const describe = useErrorMessage();
  const toast = useToast();
  const openPage = useOpenPage();
  const [opening, setOpening] = useState<number | null>(null);
  if (application.documents.length === 0) return null;

  const nameOf = (document: VendorApplicationDocument) => {
    if (document.label) return document.label;
    const known = DOCUMENTS.find((kind) => kind === document.kind);
    return known ? t(`documents.${known}`) : storeWord(document.kind);
  };

  const open = async (index: number) => {
    const document = application.documents[index];
    if (!document) return;
    if (linkStillOpen(document)) {
      openPage(document.url, nameOf(document));
      return;
    }
    setOpening(index);
    try {
      const fresh = await refetch();
      if (fresh.isError || !fresh.data) {
        toast.show({ message: describe(fresh.error), tone: 'danger' });
        return;
      }
      const same =
        fresh.data.documents.find(
          (candidate) => candidate.kind === document.kind && candidate.label === document.label
        ) ?? fresh.data.documents[index];
      if (same) openPage(same.url, nameOf(same));
      else toast.show({ message: t('detail.documentGone'), tone: 'danger' });
    } finally {
      setOpening(null);
    }
  };

  return (
    <View>
      <SectionLabel title={t('detail.documents')} />
      <RowGroup>
        {application.documents.map((document, index) => (
          <DocumentRow
            key={`${document.kind}-${index}`}
            name={nameOf(document)}
            opening={opening === index}
            disabled={opening !== null}
            onPress={() => void open(index)}
          />
        ))}
      </RowGroup>
      <GroupFootnote text={t('detail.documentsNote')} />
    </View>
  );
}

/** A document: its name, opened in the browser; a spinner while a new link is fetched. */
function DocumentRow({
  name,
  opening,
  disabled,
  onPress,
}: {
  name: string;
  opening: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const t = useTranslations('applications.detail');

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={t('openDocument', { name })}
      accessibilityState={{ disabled, busy: opening }}
      disabled={disabled}
      onPress={onPress}
      className="min-h-[52px] flex-row items-center gap-3 px-4 py-3 active:bg-surface-alt">
      <Icon name="file-text" size={22} colorClassName="accent-link" />
      <Text variant="subheading" className="flex-1 text-link">
        {name}
      </Text>
      {opening ? (
        <ActivityIndicator colorClassName="accent-link" />
      ) : (
        <Icon name="chevron-right" size={18} colorClassName="accent-link" directional />
      )}
    </Pressable>
  );
}

/** The store's own questions, a checkbox's answer in the app's own words. */
function Answers({ application }: SectionProps) {
  const t = useTranslations('applications.detail');
  if (application.answers.length === 0) return null;

  return (
    <View>
      <SectionLabel title={t('answers')} />
      <RowGroup>
        {application.answers.map((answer, index) => (
          <ValueRow
            key={`${answer.label}-${index}`}
            label={answer.label}
            value={
              answer.checked === undefined ? answer.value : answer.checked ? t('yes') : t('no')
            }
          />
        ))}
      </RowGroup>
    </View>
  );
}

/** When it was decided, and the reason the applicant was given. */
function Decision({ application }: SectionProps) {
  const t = useTranslations('applications.detail');
  const dateTime = useDateTime();
  if (!application.decidedAt && !application.rejectionReason) return null;

  return (
    <View>
      <SectionLabel title={t('decision')} />
      <RowGroup>
        {application.decidedAt ? (
          <ValueRow label={t('decidedOn')} value={dateTime(application.decidedAt)} />
        ) : null}
        {application.rejectionReason ? (
          <ValueRow label={t('reason')} value={application.rejectionReason} />
        ) : null}
      </RowGroup>
    </View>
  );
}
