/**
 * The eSIM area's endpoints (`/esim/…`, contracts/mobile/biz/v1/esim.ts):
 * the store's administrators with the eSIM permissions, in the store's own
 * workspace.
 */
import {
  CustomerEmail,
  CustomerEmailList,
  CustomerEsims,
  EsimAccess,
  EsimActionResult,
  EsimDetail,
  EsimJobRunResult,
  EsimList,
  EsimStatus,
  NumberList,
  ProblemActionResult,
  ProblemList,
  TopupList,
  type CustomerEmailRequest,
  type EsimActionRequest,
  type EsimListQuery,
  type NumberListQuery,
  type ProblemActionRequest,
  type ProblemListQuery,
  type TopupListQuery,
} from '@/contracts/mobile/biz/v1/esim';
import { api } from '@/api/api';
import type { Conditional } from '@/api/etag-query';
import type { WorkspaceScope } from '@/api/scope';

const id = (value: string) => encodeURIComponent(value);

export function getEsimAccess(
  { locale, workspace }: WorkspaceScope,
  { etag, signal }: Conditional
) {
  return api.request({ locale, workspace, path: '/esim/access', etag, signal }, EsimAccess);
}

export function getEsims(
  { locale, workspace }: WorkspaceScope,
  query: EsimListQuery,
  { etag, signal }: Conditional
) {
  return api.request({ locale, workspace, path: '/esim/esims', query, etag, signal }, EsimList);
}

export function getEsim(
  { locale, workspace }: WorkspaceScope,
  esimId: string,
  { etag, signal }: Conditional
) {
  return api.request(
    { locale, workspace, path: `/esim/esims/${id(esimId)}`, etag, signal },
    EsimDetail
  );
}

export function postEsimAction(
  { locale, workspace }: WorkspaceScope,
  esimId: string,
  body: EsimActionRequest,
  idempotencyKey: string
) {
  return api.data(
    {
      locale,
      workspace,
      path: `/esim/esims/${id(esimId)}/actions`,
      method: 'POST',
      body,
      idempotencyKey,
    },
    EsimActionResult
  );
}

export function getProblems(
  { locale, workspace }: WorkspaceScope,
  query: ProblemListQuery,
  { etag, signal }: Conditional
) {
  return api.request(
    { locale, workspace, path: '/esim/problems', query, etag, signal },
    ProblemList
  );
}

export function postProblemAction(
  { locale, workspace }: WorkspaceScope,
  problemId: string,
  body: ProblemActionRequest,
  idempotencyKey: string
) {
  return api.data(
    {
      locale,
      workspace,
      path: `/esim/problems/${id(problemId)}/actions`,
      method: 'POST',
      body,
      idempotencyKey,
    },
    ProblemActionResult
  );
}

export function getEsimStatus(
  { locale, workspace }: WorkspaceScope,
  { etag, signal }: Conditional
) {
  return api.request({ locale, workspace, path: '/esim/status', etag, signal }, EsimStatus);
}

export function postRunJob({ locale, workspace }: WorkspaceScope, job: string) {
  return api.data(
    { locale, workspace, path: `/esim/status/jobs/${id(job)}`, method: 'POST' },
    EsimJobRunResult
  );
}

export function getTopups(
  { locale, workspace }: WorkspaceScope,
  query: TopupListQuery,
  { etag, signal }: Conditional
) {
  return api.request({ locale, workspace, path: '/esim/topups', query, etag, signal }, TopupList);
}

export function getNumbers(
  { locale, workspace }: WorkspaceScope,
  query: NumberListQuery,
  { etag, signal }: Conditional
) {
  return api.request({ locale, workspace, path: '/esim/numbers', query, etag, signal }, NumberList);
}

export function getCustomerEsims(
  { locale, workspace }: WorkspaceScope,
  customerId: string,
  { etag, signal }: Conditional
) {
  return api.request(
    { locale, workspace, path: `/esim/customers/${id(customerId)}/esims`, etag, signal },
    CustomerEsims
  );
}

export function getCustomerEmails(
  { locale, workspace }: WorkspaceScope,
  customerId: string,
  { etag, signal }: Conditional
) {
  return api.request(
    { locale, workspace, path: `/esim/customers/${id(customerId)}/emails`, etag, signal },
    CustomerEmailList
  );
}

export function postCustomerEmail(
  { locale, workspace }: WorkspaceScope,
  customerId: string,
  body: CustomerEmailRequest,
  idempotencyKey: string
) {
  return api.data(
    {
      locale,
      workspace,
      path: `/esim/customers/${id(customerId)}/emails`,
      method: 'POST',
      body,
      idempotencyKey,
    },
    CustomerEmail
  );
}
