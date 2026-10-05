/**
 * Client for the AmwajSalesApi Apex REST service.
 *
 * Requests go through @salesforce/platform-sdk's fetch, which uses the
 * signed-in Salesforce session and adds the CSRF token for apexrest calls.
 * No credentials or tokens are handled here. All business rules, totals and
 * permissions are decided by Salesforce; this client only transports them.
 */
import { createDataSDK } from '@salesforce/platform-sdk';
import type {
  Commission,
  DealDetail,
  DealRow,
  EoiCreated,
  EoiRow,
  LeadDetail,
  LeadRow,
  Activity,
  Me,
  OfferInput,
  Option,
  Overview,
  ReservationCreated,
  ReservationInput,
  UnitDetail,
  UnitFacets,
  UnitPage,
} from './salesTypes';

const BASE = '/services/apexrest/amwaj/sales/v1';

export class ApiError extends Error {
  readonly status: number;
  /** Server message kept for troubleshooting (shown under "Details"). */
  readonly detail?: string;

  constructor(status: number, message: string, detail?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }

  get isPermission(): boolean {
    return this.status === 403;
  }
}

type DataSDK = Awaited<ReturnType<typeof createDataSDK>>;

let sdkPromise: Promise<DataSDK> | null = null;

async function sdkFetch(): Promise<NonNullable<DataSDK['fetch']>> {
  sdkPromise ??= createDataSDK();
  const sdk = await sdkPromise;
  if (!sdk.fetch) {
    throw new ApiError(0, 'Salesforce is not reachable from this page. Open the app from Salesforce.');
  }
  return sdk.fetch.bind(sdk);
}

function messageForStatus(status: number): string {
  if (status === 401) return 'Your Salesforce session has ended. Reload the page to sign in again.';
  if (status === 403) return 'You do not have permission to do that.';
  if (status === 404) return 'That record was not found or is not shared with you.';
  if (status >= 500) return 'Salesforce could not complete the request. Please try again.';
  return 'The request could not be completed.';
}

async function request<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
  const doFetch = await sdkFetch();
  let res: Response;
  try {
    res = await doFetch(BASE + path, {
      method,
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Could not reach Salesforce. Check your connection and try again.');
  }
  const text = await res.text();
  let json: unknown = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  if (!res.ok) {
    // Apex REST answers either {error} (this API) or [{message, errorCode}] (platform errors).
    const apiMessage =
      (json as { error?: string } | undefined)?.error ??
      (Array.isArray(json) ? (json[0] as { message?: string })?.message : undefined);
    throw new ApiError(res.status, apiMessage || messageForStatus(res.status), `HTTP ${res.status}${apiMessage ? `: ${apiMessage}` : ''}`);
  }
  return json as T;
}

function query(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

const enc = encodeURIComponent;

export const salesApi = {
  me: () => request<Me>('GET', '/me'),
  overview: () => request<Overview>('GET', '/overview'),

  leads: (status?: string, search?: string, projectId?: string) =>
    request<{ leads: LeadRow[]; statusOptions: Option[] }>('GET', `/leads${query({ status, search, projectId })}`),
  lead: (id: string) => request<LeadDetail>('GET', `/leads/${enc(id)}`),
  updateLead: (id: string, changes: { status?: string; rating?: string; description?: string }) =>
    request<LeadDetail>('PATCH', `/leads/${enc(id)}`, changes),

  addActivity: (
    parent: 'leads' | 'deals',
    id: string,
    activity: { kind: 'CALL' | 'FOLLOW_UP'; subject: string; comments?: string; dueDate?: string }
  ) => request<{ activities: Activity[] }>('POST', `/${parent}/${enc(id)}/activities`, activity),
  completeActivity: (taskId: string) => request<{ id: string }>('POST', `/activities/${enc(taskId)}/complete`),

  deals: (search?: string, projectId?: string) => request<{ deals: DealRow[] }>('GET', `/deals${query({ search, projectId })}`),
  deal: (id: string) => request<DealDetail>('GET', `/deals/${enc(id)}`),

  unitFacets: () => request<UnitFacets>('GET', '/units/facets'),
  units: (filters: Record<string, string | number | undefined>) => request<UnitPage>('GET', `/units${query(filters)}`),
  unit: (id: string) => request<UnitDetail>('GET', `/units/${enc(id)}`),

  eois: () => request<{ eois: EoiRow[] }>('GET', '/eois'),
  eoi: (id: string) => request<EoiRow>('GET', `/eois/${enc(id)}`),
  createEoi: (offer: OfferInput) => request<EoiCreated>('POST', '/eois', offer),
  attachSignedEoi: (id: string, fileName: string, base64: string) =>
    request<EoiRow>('POST', `/eois/${enc(id)}/document`, { fileName, base64 }),
  createReservation: (input: ReservationInput) => request<ReservationCreated>('POST', '/reservations', input),

  commission: () => request<Commission>('GET', '/commission'),
};

const fileUrls = new Map<string, Promise<string>>();

/**
 * Object URL for a private Salesforce file, fetched with the user's session.
 * Cached per version for the life of the page.
 */
export function fileObjectUrl(versionId: string): Promise<string> {
  let url = fileUrls.get(versionId);
  if (!url) {
    url = (async () => {
      const doFetch = await sdkFetch();
      const res = await doFetch(`${BASE}/files/${enc(versionId)}`, { method: 'GET' });
      if (!res.ok) throw new ApiError(res.status, messageForStatus(res.status));
      return URL.createObjectURL(await res.blob());
    })();
    url.catch(() => fileUrls.delete(versionId));
    fileUrls.set(versionId, url);
  }
  return url;
}

/** Reads a browser File as base64 (without the data: prefix). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.readAsDataURL(file);
  });
}
