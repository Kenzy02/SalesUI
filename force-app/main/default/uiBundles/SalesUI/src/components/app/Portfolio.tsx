import type { ReactNode } from 'react';
import { EyeOff } from 'lucide-react';
import type {
  InstallmentCounts,
  PaymentFlag,
  SaleStatus,
} from '@/api/salesTypes';
import { amount } from '@/lib/format';
import { SALE_STATUS } from '@/lib/portfolio';
import { StatusPill } from './Primitives';

export function SaleStatusPill({ status }: { status: SaleStatus }) {
  const s = SALE_STATUS[status];
  return <StatusPill tone={s.tone}>{s.label}</StatusPill>;
}

/** A value Salesforce doesn't record (or the user can't see), shown as such rather than as zero. */
export function Unavailable({
  children = 'Not recorded',
}: {
  children?: ReactNode;
}) {
  return (
    <span className="font-normal italic text-muted-foreground">{children}</span>
  );
}

/** Amount, or "Not available" when the server could not provide it to this user. */
export function MoneyValue({
  value,
  currency,
}: {
  value: number | null | undefined;
  currency: string;
}) {
  return value == null ? (
    <Unavailable>Not available</Unavailable>
  ) : (
    <>{amount(value, currency)}</>
  );
}

/** Short hints shown behind an "i" instead of explanations in the page body. */
export const TIPS = {
  confirmedPaid:
    'Money finance has confirmed: booking fees and property payments, less processed refunds.',
  bookingFee:
    'Charged on top of the unit price, so it does not reduce the balance.',
  notRecorded:
    'Instalment schedules and receipts aren’t recorded in Salesforce, so this can’t be shown without guessing.',
  awaitingFinance: 'Requested or paid, but not yet confirmed by finance.',
  demo: 'Sample figures for the demonstration. Not from Salesforce.',
};

/** "2 paid · 1 part paid · 1 overdue · 5 upcoming", skipping zeros. */
export function InstallmentSummary({ counts }: { counts: InstallmentCounts }) {
  const parts: { n: number; label: string; className?: string }[] = [
    { n: counts.paid, label: 'paid' },
    { n: counts.partial, label: 'part paid', className: 'text-amber-800' },
    { n: counts.overdue, label: 'overdue', className: 'text-rose-700' },
    { n: counts.upcoming, label: 'upcoming' },
  ];
  const shown = parts.filter(p => p.n > 0);
  if (!shown.length) return <>None</>;
  return (
    <>
      {shown.map((p, i) => (
        <span key={p.label} className={p.className}>
          {i > 0 && <span className="text-muted-foreground"> · </span>}
          {p.n} {p.label}
        </span>
      ))}
    </>
  );
}

export function HiddenRecordsNote() {
  return (
    <p className="flex gap-1.5 text-xs text-amber-900">
      <EyeOff className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      Some EOIs or reservations on this customer&rsquo;s deals aren&rsquo;t
      shared with you, so they aren&rsquo;t included.
    </p>
  );
}

export const FLAG_TEXT: Record<PaymentFlag, string> = {
  POSSIBLE_CARRIED_DEPOSIT:
    'A confirmed deposit on a cancelled reservation was not counted, because a later reservation on the same EOI has its own confirmed deposit. Check with finance whether it was carried over or refunded.',
  EXPIRED_FEE_NOT_REFUNDED:
    'An expired EOI has a confirmed booking fee and no processed refund. It is still counted as paid.',
};
