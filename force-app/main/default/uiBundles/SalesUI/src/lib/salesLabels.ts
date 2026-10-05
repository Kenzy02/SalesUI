/**
 * Plain-language labels for Salesforce statuses. The values are the org's
 * picklist values (verified in the AmwajReact org); unknown values fall back
 * to the raw value so nothing is hidden.
 */
import type { CommissionState, EoiNextStep } from '@/api/salesTypes';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand';

export const UNIT_STATUS: Record<string, { label: string; tone: Tone }> = {
  Available: { label: 'Available', tone: 'success' },
  NotReleased: { label: 'Not released', tone: 'neutral' },
  Held: { label: 'On hold', tone: 'warning' },
  Reserved: { label: 'Reserved', tone: 'info' },
  Sold: { label: 'Sold', tone: 'neutral' },
  SoldWithDeed: { label: 'Sold (deed issued)', tone: 'neutral' },
  Blocking: { label: 'Blocked', tone: 'danger' },
  ResaleLocked: { label: 'Resale locked', tone: 'neutral' },
};

export const LEAD_STATUS: Record<string, Tone> = {
  New: 'brand',
  Working: 'info',
  Qualified: 'success',
  Unqualified: 'neutral',
};

export const DEAL_STAGE: Record<string, Tone> = {
  Working: 'info',
  EOI: 'brand',
  Contracting: 'warning',
  'Closed Won': 'success',
  'Closed Lost': 'neutral',
};

export const EOI_STATUS: Record<string, { label: string; tone: Tone }> = {
  Submitted: { label: 'Submitted', tone: 'info' },
  Paid: { label: 'Paid', tone: 'success' },
  Expired: { label: 'Expired', tone: 'neutral' },
  Refunded: { label: 'Refunded', tone: 'neutral' },
};

export const RESERVATION_STATUS: Record<string, { label: string; tone: Tone }> = {
  Submitted: { label: 'On hold', tone: 'warning' },
  PendingWithContracts: { label: 'With contracts', tone: 'info' },
  Active: { label: 'Active (sold)', tone: 'success' },
  Cancelled: { label: 'Cancelled', tone: 'neutral' },
  Terminated: { label: 'Terminated', tone: 'neutral' },
};

/** The EOI's next step in the org's process, worded for a sales executive. */
export const EOI_STEP: Record<EoiNextStep, { label: string; detail: string; tone: Tone }> = {
  AWAITING_DISCOUNT_APPROVAL: {
    label: 'Discount awaiting approval',
    detail: 'The requested discount is with the approvers. The unit is held once it is approved.',
    tone: 'warning',
  },
  DISCOUNT_REJECTED: {
    label: 'Discount rejected',
    detail: 'The discount was not approved. Review the offer with your team leader.',
    tone: 'danger',
  },
  ATTACH_SIGNED_EOI: {
    label: 'Signed EOI needed',
    detail: 'The signed EOI document must be filed before finance can confirm the payment.',
    tone: 'warning',
  },
  AWAITING_FINANCE: {
    label: 'Waiting for finance',
    detail: 'Signed EOI is on file. Finance confirms the reservation fee payment in Salesforce.',
    tone: 'info',
  },
  CREATE_RESERVATION: {
    label: 'Ready to reserve',
    detail: 'Payment is confirmed. Create the reservation to hold the unit for the contract stage.',
    tone: 'success',
  },
  RESERVED: {
    label: 'Reserved',
    detail: 'A reservation exists for this EOI. Contracts and finance continue in Salesforce.',
    tone: 'success',
  },
  CLOSED: { label: 'Closed', detail: 'This EOI expired or was refunded.', tone: 'neutral' },
};

export const COMMISSION_STATE: Record<CommissionState, { label: string; tone: Tone }> = {
  ELIGIBLE: { label: 'Earning commission', tone: 'success' },
  AWAITING_SIGNATURE: { label: 'Waiting for signed EOI', tone: 'warning' },
  NO_CONFIRMED_COLLECTIONS: { label: 'Signed, no confirmed collections', tone: 'neutral' },
};

export const INSTALLMENT_TYPE: Record<string, string> = {
  DownPayment: 'Down payment',
  SecondPayment: 'Second payment',
  DeliveryPayment: 'Delivery payment',
  RecurringInstallment: 'Instalment',
  HandoverPayment: 'Handover payment',
  PostHandoverInstallment: 'Post-handover instalment',
  LaunchCheck: 'Launch cheque',
  FinalSettlement: 'Final settlement',
};

export const FREQUENCY: Record<string, string> = {
  Monthly: 'monthly',
  Quarterly: 'quarterly',
  SemiAnnual: 'every 6 months',
  Annual: 'yearly',
  Custom: 'custom schedule',
};

export const FINISHING: Record<string, string> = {
  FullyFinished: 'Fully finished',
  SemiFinished: 'Semi-finished',
  RedBrick: 'Red brick',
  Shell: 'Shell & core',
  NoFinishing: 'No finishing',
};

export function unitStatus(value: string | undefined) {
  return (value && UNIT_STATUS[value]) || { label: value ?? 'Unknown', tone: 'neutral' as Tone };
}
