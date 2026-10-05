import { useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { Check, Circle, Download, FileText, Hourglass, Lock, Upload } from 'lucide-react';
import { ApiError, fileObjectUrl, fileToBase64, salesApi } from '@/api/salesApi';
import type { EoiRow, ReservationCreated } from '@/api/salesTypes';
import { useMe } from '@/components/app/MeContext';
import { FormField, TextArea, TextInput } from '@/components/app/FormControls';
import { PaymentPlanList } from '@/components/app/PaymentPlans';
import { BackLink, DetailList, ErrorState, InlineError, LoadingBlock, PageHeader, Section, StatusPill } from '@/components/app/Primitives';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/sonner';
import { useApi } from '@/hooks/useApi';
import { date, daysUntil, fileSize, money, percent, relativeDays } from '@/lib/format';
import { EOI_STATUS, EOI_STEP, RESERVATION_STATUS } from '@/lib/salesLabels';
import { cn } from '@/lib/utils';

export default function EoiDetailPage() {
  const { id = '' } = useParams();
  const me = useMe();
  const { data: eoi, loading, error, reload, setData } = useApi(() => salesApi.eoi(id), [id]);
  const [reserveOpen, setReserveOpen] = useState(false);

  return (
    <>
      <BackLink to="/eois">EOIs & holds</BackLink>
      {loading && !eoi ? (
        <LoadingBlock rows={4} label="Loading EOI" />
      ) : error && !eoi ? (
        <ErrorState message={error} onRetry={reload} />
      ) : eoi ? (
        <>
          <PageHeader
            eyebrow={`EOI ${eoi.name ?? ''}`}
            title={eoi.customerName ?? eoi.dealName ?? 'EOI'}
            description={
              <span className="inline-flex flex-wrap items-center gap-2">
                {EOI_STATUS[eoi.status ?? ''] && <StatusPill tone={EOI_STATUS[eoi.status!].tone}>{EOI_STATUS[eoi.status!].label}</StatusPill>}
                {eoi.nextStep && <StatusPill tone={EOI_STEP[eoi.nextStep].tone}>{EOI_STEP[eoi.nextStep].label}</StatusPill>}
                <span>
                  Unit {eoi.unitName} · {eoi.projectName}
                </span>
              </span>
            }
            actions={
              eoi.nextStep === 'CREATE_RESERVATION' && me.canCreateReservation ? (
                <Button size="lg" onClick={() => setReserveOpen(true)}>
                  <Lock /> Reserve unit ({me.reservationHoldDays ?? '—'}-day hold)
                </Button>
              ) : undefined
            }
          />
          {eoi.nextStep && (
            <p className="-mt-3 mb-6 max-w-3xl text-sm text-muted-foreground">{EOI_STEP[eoi.nextStep].detail}</p>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Progress eoi={eoi} />
              <SignedDocument eoi={eoi} onUpdated={setData} />
              {eoi.reservations.length > 0 && (
                <Section title="Reservation">
                  <ul className="divide-y divide-border">
                    {eoi.reservations.map(r => {
                      const s = RESERVATION_STATUS[r.status ?? ''];
                      return (
                        <li key={r.id} className="py-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium text-brand-navy">{r.name}</span>
                            {s && <StatusPill tone={s.tone}>{s.label}</StatusPill>}
                          </div>
                          <DetailList
                            columns={3}
                            items={[
                              { label: 'Hold until', value: r.status === 'Submitted' ? date(r.holdExpiry) : '—' },
                              { label: 'Deposit', value: money(r.deposit, me.currencyCode) },
                              { label: 'Deposit confirmed by finance', value: r.depositVerified ? 'Yes' : 'Not yet' },
                              { label: 'Net price', value: money(r.netPrice, me.currencyCode) },
                            ]}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </Section>
              )}
            </div>
            <div className="space-y-6">
              <HoldCard eoi={eoi} today={me.today} />
              <Section title="Terms">
                <DetailList
                  columns={1}
                  items={[
                    {
                      label: 'Customer deal',
                      value: eoi.dealId ? (
                        <Link to={`/customers/${eoi.dealId}`} className="text-brand-steel underline">
                          {eoi.dealName}
                        </Link>
                      ) : undefined,
                    },
                    {
                      label: 'Unit',
                      value: eoi.unitId ? (
                        <Link to={`/units/${eoi.unitId}`} className="text-brand-steel underline">
                          {eoi.unitName} · {eoi.projectName}
                        </Link>
                      ) : undefined,
                    },
                    { label: 'Payment plan', value: eoi.paymentPlanName },
                    { label: 'Payment method', value: eoi.paymentMethod },
                    {
                      label: 'Discount',
                      value: eoi.discountPct ? `${percent(eoi.discountPct)} · ${eoi.approvalStatus ?? 'Draft'}` : 'None',
                    },
                    { label: 'Net property price', value: money(eoi.netUnitPrice, me.currencyCode) },
                    { label: 'Booking (reservation) fee', value: money(eoi.reservationFee, me.currencyCode) },
                    { label: 'Created', value: `${date(eoi.createdDate)}${eoi.ownerName ? ` by ${eoi.ownerName}` : ''}` },
                  ]}
                />
                {eoi.notes && <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{eoi.notes}</p>}
              </Section>
            </div>
          </div>
          {reserveOpen && (
            <ReserveDialog
              eoi={eoi}
              onClose={() => setReserveOpen(false)}
              onDone={res => {
                setReserveOpen(false);
                toast.success(`Reservation ${res.name} created`, {
                  description: `Unit ${res.unitName} is held until ${date(res.holdExpiry)}.`,
                });
                reload();
              }}
            />
          )}
        </>
      ) : null}
    </>
  );
}

function Progress({ eoi }: { eoi: EoiRow }) {
  const hasDiscount = (eoi.discountPct ?? 0) > 0;
  const live = eoi.reservations.find(r => r.status !== 'Cancelled' && r.status !== 'Terminated');
  const steps: { label: string; done: boolean; detail: ReactNode }[] = [
    { label: 'EOI created and unit hold requested', done: true, detail: date(eoi.createdDate) },
    ...(hasDiscount
      ? [
          {
            label: 'Discount approved',
            done: eoi.approvalStatus === 'Approved',
            detail: `${percent(eoi.discountPct)} requested · ${eoi.approvalStatus ?? 'Draft'}`,
          },
        ]
      : []),
    {
      label: 'Signed EOI document on file',
      done: !!eoi.documentAttached,
      detail: eoi.documentAttached ? `${eoi.documents.length || 'No'} file${eoi.documents.length === 1 ? '' : 's'} on this EOI` : 'Not yet',
    },
    {
      label: 'Booking fee confirmed by finance',
      done: !!eoi.paymentVerified,
      detail: eoi.paymentVerified ? `Confirmed ${date(eoi.paymentVerifiedDate)}` : 'Waiting for finance',
    },
    {
      label: 'Unit reserved',
      done: !!live,
      detail: live ? `${live.name} · ${RESERVATION_STATUS[live.status ?? '']?.label ?? live.status}` : 'After payment is confirmed',
    },
  ];
  const firstOpen = steps.findIndex(s => !s.done);
  return (
    <Section title="Progress">
      <ol className="space-y-0">
        {steps.map((s, i) => (
          <li key={s.label} className="relative flex gap-3 pb-5 last:pb-0">
            {i < steps.length - 1 && <span className="absolute left-[11px] top-6 h-[calc(100%-1rem)] w-px bg-border" aria-hidden="true" />}
            <span
              className={cn(
                'relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border',
                s.done ? 'border-emerald-600 bg-emerald-600 text-white' : i === firstOpen ? 'border-brand-navy bg-white text-brand-navy' : 'border-border bg-white text-muted-foreground'
              )}
              aria-hidden="true"
            >
              {s.done ? <Check className="size-3.5" /> : <Circle className="size-2 fill-current" />}
            </span>
            <div>
              <div className={cn('text-sm font-medium', s.done ? 'text-brand-navy' : i === firstOpen ? 'text-brand-navy' : 'text-muted-foreground')}>
                {s.label}
                <span className="sr-only">{s.done ? ' (done)' : i === firstOpen ? ' (current step)' : ' (not started)'}</span>
              </div>
              <div className="text-xs text-muted-foreground">{s.detail}</div>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function HoldCard({ eoi, today }: { eoi: EoiRow; today: string }) {
  const days = daysUntil(eoi.expiryDate, today);
  const live = eoi.nextStep && !['RESERVED', 'CLOSED'].includes(eoi.nextStep);
  return (
    <Section title="Unit hold">
      {!live ? (
        <p className="text-sm text-muted-foreground">
          {eoi.nextStep === 'RESERVED' ? 'The unit is now held by the reservation.' : 'This EOI no longer holds the unit.'}
        </p>
      ) : (
        <div className="flex items-start gap-3">
          <Hourglass className={cn('mt-0.5 size-5', days !== null && days < 0 ? 'text-rose-700' : 'text-amber-700')} aria-hidden="true" />
          <div>
            <div className="text-lg font-semibold text-brand-navy">{date(eoi.expiryDate)}</div>
            <div className="text-sm text-muted-foreground">
              {days !== null && days < 0
                ? `Expired ${relativeDays(eoi.expiryDate, today)}. Salesforce has flagged it as due; the unit stays held until the EOI is marked expired or extended in Salesforce.`
                : `Hold ends ${relativeDays(eoi.expiryDate, today)}. Unit status: ${eoi.unitStatus ?? '—'}.`}
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

function SignedDocument({ eoi, onUpdated }: { eoi: EoiRow; onUpdated: (e: EoiRow) => void }) {
  const me = useMe();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canUpload = me.canEditEoi && eoi.canEdit && eoi.status === 'Submitted';

  const upload = async (file: File) => {
    setError(null);
    if (file.size > 3 * 1024 * 1024) {
      setError('The file is larger than 3 MB. Scan it at a lower resolution and try again.');
      return;
    }
    setUploading(true);
    try {
      const updated = await salesApi.attachSignedEoi(eoi.id, file.name, await fileToBase64(file));
      onUpdated(updated);
      toast.success('Signed EOI filed in Salesforce');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The file could not be uploaded.');
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  };

  const open = async (versionId: string) => {
    try {
      window.open(await fileObjectUrl(versionId), '_blank', 'noopener');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'The file could not be opened.');
    }
  };

  return (
    <Section
      title="Signed EOI"
      description="Signature evidence is the signed EOI document filed in Salesforce. There is no electronic signature on this process."
    >
      {eoi.documents.length > 0 ? (
        <ul className="space-y-2">
          {eoi.documents.map(d => (
            <li key={d.versionId} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <FileText className="size-4 shrink-0 text-brand-steel" aria-hidden="true" />
                <span className="truncate font-medium">{d.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {d.fileType} {fileSize(d.size)} · {date(d.createdDate)}
                </span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => open(d.versionId)}>
                <Download /> Open
              </Button>
            </li>
          ))}
        </ul>
      ) : eoi.documentAttached ? (
        <p className="text-sm text-muted-foreground">
          Salesforce shows the signed EOI as attached, but the file is not linked to this EOI record, so it can't be shown here.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">No signed EOI document is on file yet.</p>
      )}
      {canUpload ? (
        <div className="mt-4 space-y-2">
          <input
            ref={input}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            className="sr-only"
            id={`eoi-upload-${eoi.id}`}
            onChange={e => e.target.files?.[0] && upload(e.target.files[0])}
            disabled={uploading}
          />
          <Button variant="outline" size="lg" disabled={uploading} onClick={() => input.current?.click()}>
            <Upload /> {uploading ? 'Uploading…' : 'Upload signed EOI (PDF or photo, max 3 MB)'}
          </Button>
          <InlineError message={error} />
        </div>
      ) : (
        eoi.status === 'Submitted' &&
        !eoi.documentAttached && (
          <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            Your Salesforce access doesn't allow filing documents on EOIs. Hand the signed EOI to the colleague who files it
            in Salesforce.
          </p>
        )
      )}
    </Section>
  );
}

function ReserveDialog({ eoi, onClose, onDone }: { eoi: EoiRow; onClose: () => void; onDone: (r: ReservationCreated) => void }) {
  const me = useMe();
  const unit = useApi(() => (eoi.unitId ? salesApi.unit(eoi.unitId) : Promise.resolve(null)), [eoi.unitId]);
  const [planId, setPlanId] = useState(eoi.paymentPlanId ?? '');
  const [deposit, setDeposit] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const cash = eoi.paymentMethod === 'Cash';

  const submit = async () => {
    if (inFlight.current) return;
    const depositNum = deposit.trim() === '' ? undefined : Number(deposit);
    if (depositNum !== undefined && (Number.isNaN(depositNum) || depositNum < 0)) {
      setError('Enter a valid deposit amount, or leave it empty.');
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const res = await salesApi.createReservation({
        eoiId: eoi.id,
        paymentPlanId: planId || undefined,
        depositAmount: cash ? depositNum : undefined,
        notes: notes.trim() || undefined,
      });
      onDone(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The reservation could not be created.');
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={o => !o && !submitting && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Reserve unit {eoi.unitName}</DialogTitle>
          <DialogDescription>
            Creates the reservation in Salesforce from paid EOI {eoi.name}. The unit is held for {me.reservationHoldDays ?? '—'} days while
            finance confirms the deposit and contracts are prepared.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {unit.loading && !unit.data ? (
            <LoadingBlock rows={2} />
          ) : unit.error ? (
            <ErrorState message={unit.error} onRetry={unit.reload} />
          ) : (
            <PaymentPlanList plans={unit.data?.pricing.plans ?? []} currency={me.currencyCode} selectable selectedId={planId} onSelect={setPlanId} />
          )}
          {cash ? (
            <FormField label={`Deposit received (${me.currencyCode})`} hint="Cash buyers: the deposit you collected, if any. Finance confirms it in Salesforce.">
              {p => <TextInput {...p} inputMode="decimal" value={deposit} onChange={e => setDeposit(e.target.value)} placeholder="0" />}
            </FormField>
          ) : (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
              The deposit is the plan's down payment, calculated by Salesforce from the chosen plan.
            </p>
          )}
          <FormField label="Notes (optional)">{p => <TextArea {...p} rows={2} value={notes} onChange={e => setNotes(e.target.value)} />}</FormField>
          <InlineError message={error} />
        </div>
        <DialogFooter>
          <Button variant="ghost" size="lg" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button size="lg" onClick={submit} disabled={submitting || !planId}>
            {submitting ? 'Reserving…' : 'Create reservation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
