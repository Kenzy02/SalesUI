import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CheckCircle2, Handshake, Hourglass, Search, ShieldCheck } from 'lucide-react';
import { ApiError, salesApi } from '@/api/salesApi';
import type { CustomerDetails, CustomerInput, DealRow, EoiCreated, UnitDetail } from '@/api/salesTypes';
import { useMe } from '@/components/app/MeContext';
import { FormField, NativeSelect, TextArea, TextInput } from '@/components/app/FormControls';
import { PaymentPlanList } from '@/components/app/PaymentPlans';
import { BackLink, EmptyState, ErrorState, InlineError, LoadingBlock, PageHeader, Section, StatusPill } from '@/components/app/Primitives';
import { UnitPhoto } from '@/components/app/UnitPhoto';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/useApi';
import { area, date, money, percent } from '@/lib/format';
import { unitStatus } from '@/lib/salesLabels';
import { cn } from '@/lib/utils';

/** EOI__c.Payment_Method__c values in the org (the server re-validates them). */
const PAYMENT_METHODS = [
  { value: 'Installments', label: 'Instalments (payment plan)' },
  { value: 'Cash', label: 'Cash' },
];

const EMPTY_CUSTOMER: CustomerInput = {
  fullNameArabic: '',
  mobile: '',
  nationalId: '',
  nationalIdDate: '',
  residenceId: '',
  residenceIdDate: '',
  city: '',
  district: '',
  neighborhood: '',
  alley: '',
  houseNumber: '',
};

function customerFrom(c?: CustomerDetails): CustomerInput {
  return {
    fullNameArabic: c?.fullNameArabic ?? '',
    mobile: c?.mobile ?? '',
    nationalId: c?.nationalId ?? '',
    nationalIdDate: c?.nationalIdDate ?? '',
    residenceId: c?.residenceId ?? '',
    residenceIdDate: c?.residenceIdDate ?? '',
    city: c?.city ?? '',
    district: c?.district ?? '',
    neighborhood: c?.neighborhood ?? '',
    alley: c?.alley ?? '',
    houseNumber: c?.houseNumber ?? '',
  };
}

/** Mirrors the org's EOI screen checks for instant feedback; Salesforce re-checks everything. */
function customerErrors(c: CustomerInput, today: string): Partial<Record<keyof CustomerInput, string>> {
  const e: Partial<Record<keyof CustomerInput, string>> = {};
  const required: (keyof CustomerInput)[] = ['fullNameArabic', 'mobile', 'nationalId', 'nationalIdDate', 'city', 'district', 'neighborhood', 'alley', 'houseNumber'];
  for (const k of required) if (!String(c[k] ?? '').trim()) e[k] = 'Required';
  const m = c.mobile.trim();
  if (m && !((/^07[5789]\d{8}$/.test(m)) || ((m.startsWith('+') || m.startsWith('00')) && m.length >= 12 && m.length <= 16))) {
    e.mobile = 'Iraqi mobiles start with 075, 077, 078 or 079 (11 digits); international numbers start with + or 00.';
  }
  if (c.nationalId.trim() && !/^\d{12}$/.test(c.nationalId.trim())) e.nationalId = 'Must be exactly 12 digits.';
  if (c.nationalIdDate && c.nationalIdDate >= today) e.nationalIdDate = 'Must be in the past.';
  if (c.residenceIdDate && c.residenceIdDate >= today) e.residenceIdDate = 'Must be in the past.';
  return e;
}

export default function NewEoiPage() {
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const dealId = params.get('dealId') ?? '';
  const unitId = params.get('unitId') ?? '';

  const deals = useApi(() => salesApi.deals(), []);
  const deal = useApi(() => (dealId ? salesApi.deal(dealId) : Promise.resolve(null)), [dealId]);
  const unit = useApi(() => (unitId ? salesApi.unit(unitId) : Promise.resolve(null)), [unitId]);

  const [planId, setPlanId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Installments');
  const [discount, setDiscount] = useState('0');
  const [notes, setNotes] = useState('');
  const [customer, setCustomer] = useState<CustomerInput>(EMPTY_CUSTOMER);
  const [confirmed, setConfirmed] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<EoiCreated | null>(null);
  const inFlight = useRef(false);

  // Prefill the customer's details from Salesforce when the deal changes.
  useEffect(() => {
    if (deal.data) setCustomer(customerFrom(deal.data.customer));
  }, [deal.data]);

  // Pre-select the only (or first valid) eligible plan for the chosen unit.
  const plans = useMemo(() => unit.data?.pricing.plans ?? [], [unit.data]);
  useEffect(() => {
    const usable = plans.filter(p => !p.isMisconfigured);
    setPlanId(usable.length === 1 ? usable[0].id : '');
  }, [plans]);

  const eligibleDeals = (deals.data?.deals ?? []).filter(d => !d.isClosed && !d.eoiCreated);
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const discountNum = Number(discount);
  const discountError =
    discount.trim() === '' || !Number.isInteger(discountNum) || discountNum < 0 || discountNum > 20
      ? 'Enter a whole number from 0 to 20.'
      : null;
  const custErrors = customerErrors(customer, me.today);
  const unitReady =
    unit.data && unit.data.status === 'Available' && unit.data.projectStatus === 'Selling' && unit.data.pricing.price?.listPrice != null;
  const dealReady = deal.data && !deal.data.isClosed && !deal.data.eoiCreated && deal.data.canEdit;
  const formValid = dealReady && unitReady && planId && !discountError && Object.keys(custErrors).length === 0 && confirmed;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setShowErrors(true);
    if (!formValid || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await salesApi.createEoi({
        dealId,
        unitId,
        paymentPlanId: planId,
        discountPct: discountNum,
        paymentMethod,
        notes: notes.trim() || undefined,
        customer: {
          ...customer,
          residenceId: customer.residenceId?.trim() || undefined,
          residenceIdDate: customer.residenceIdDate || undefined,
        },
      });
      setCreated(result);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setSubmitError(
        err instanceof ApiError && err.status === 409
          ? `${err.message} Nothing was reserved.`
          : err instanceof Error
            ? err.message
            : 'The EOI could not be created.'
      );
      if (err instanceof ApiError && err.status === 409) unit.reload();
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  if (created) return <Created result={created} dealId={dealId} />;

  if (!me.canCreateEoi) {
    return (
      <>
        <BackLink to="/units">Units</BackLink>
        <Section>
          <EmptyState icon={<ShieldCheck className="size-5" />} title="You can't create EOIs">
            Your Salesforce access does not include creating EOIs. Ask your administrator if this is unexpected.
          </EmptyState>
        </Section>
      </>
    );
  }

  return (
    <>
      <BackLink to={dealId ? `/customers/${dealId}` : unitId ? `/units/${unitId}` : '/units'}>Back</BackLink>
      <PageHeader
        eyebrow="New EOI"
        title="Start an EOI and hold a unit"
        description={`Creating the EOI holds the unit for ${me.eoiPeriodDays ?? 'the configured number of'} days, as set in Salesforce. A paid EOI can then be reserved for ${me.reservationHoldDays ?? 'the configured number of'} days.`}
      />

      <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* 1. Customer deal */}
          <Section title="1. Customer" description="EOIs are created on one of your customer deals.">
            {deals.loading && !deals.data ? (
              <LoadingBlock rows={1} />
            ) : deals.error ? (
              <ErrorState message={deals.error} onRetry={deals.reload} />
            ) : eligibleDeals.length === 0 && !dealId ? (
              <EmptyState icon={<Handshake className="size-5" />} title="No customer deals ready for an EOI">
                You need an open deal without an EOI. Convert a qualified lead in Salesforce to create one.
              </EmptyState>
            ) : (
              <FormField label="Customer deal" required error={showErrors && !dealReady ? 'Choose an open deal without an EOI.' : null}>
                {p => (
                  <NativeSelect {...p} value={dealId} onChange={e => set('dealId', e.target.value)}>
                    <option value="">Choose a customer…</option>
                    {dealId && !eligibleDeals.some(d => d.id === dealId) && deal.data && (
                      <option value={dealId} disabled>
                        {deal.data.customerName} — {deal.data.eoiCreated ? 'already has an EOI' : 'not available'}
                      </option>
                    )}
                    {eligibleDeals.map((d: DealRow) => (
                      <option key={d.id} value={d.id}>
                        {d.customerName ?? d.name} · {d.projectName ?? 'no project'}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
            )}
          </Section>

          {/* 2. Unit */}
          <Section title="2. Unit">
            {unitId ? (
              unit.loading && !unit.data ? (
                <LoadingBlock rows={1} />
              ) : unit.error ? (
                <ErrorState message={unit.error} onRetry={unit.reload} />
              ) : unit.data ? (
                <SelectedUnit unit={unit.data} currency={me.currencyCode} onChange={() => set('unitId', '')} />
              ) : null
            ) : (
              <UnitPicker preferredProjectId={deal.data?.projectId} dealId={dealId} onPick={id => set('unitId', id)} currency={me.currencyCode} />
            )}
            {showErrors && unitId && unit.data && !unitReady && (
              <p className="mt-3 text-sm font-medium text-rose-700">This unit can't be offered. Choose another available unit.</p>
            )}
          </Section>

          {/* 3. Plan & terms */}
          <Section title="3. Payment plan and terms" description="Plans and prices come from the unit's active price list and payment plans.">
            {!unit.data ? (
              <p className="text-sm text-muted-foreground">Choose a unit first.</p>
            ) : plans.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payment plan applies to this unit, so it can't be offered yet.</p>
            ) : (
              <div className="space-y-5">
                <PaymentPlanList plans={plans} currency={me.currencyCode} selectable selectedId={planId} onSelect={setPlanId} />
                {showErrors && !planId && <p className="text-sm font-medium text-rose-700">Choose a payment plan.</p>}
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Payment method" required>
                    {p => (
                      <NativeSelect {...p} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                        {PAYMENT_METHODS.map(m => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </NativeSelect>
                    )}
                  </FormField>
                  <FormField
                    label="Requested discount (%)"
                    hint="Whole number, 0–20. Any discount goes to approval (up to 5%: discount approvers; above: sales director) and the unit is held once approved."
                    error={showErrors ? discountError : null}
                  >
                    {p => <TextInput {...p} type="number" min={0} max={20} step={1} inputMode="numeric" value={discount} onChange={e => setDiscount(e.target.value)} />}
                  </FormField>
                </div>
                <FormField label="Notes (optional)">{p => <TextArea {...p} value={notes} onChange={e => setNotes(e.target.value)} rows={3} />}</FormField>
              </div>
            )}
          </Section>

          {/* 4. Customer details */}
          <Section
            title="4. Customer details"
            description="Required by the EOI process. Saved to the customer's record in Salesforce together with the EOI."
          >
            {!dealId ? (
              <p className="text-sm text-muted-foreground">Choose a customer first.</p>
            ) : deal.loading && !deal.data ? (
              <LoadingBlock rows={2} />
            ) : (
              <CustomerForm
                value={customer}
                onChange={setCustomer}
                errors={showErrors ? custErrors : {}}
                cityOptions={deal.data?.customer?.cityOptions ?? []}
                today={me.today}
              />
            )}
          </Section>
        </div>

        {/* 5. Review */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-32">
            <Section title="5. Review and confirm">
              <Review deal={deal.data ?? null} unit={unit.data ?? null} planName={plans.find(p => p.id === planId)?.name} discount={discountError ? null : discountNum} paymentMethod={paymentMethod} />
              <label className="mt-4 flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-[#1f2a5c]"
                  checked={confirmed}
                  onChange={e => setConfirmed(e.target.checked)}
                />
                <span>The customer has agreed to this EOI, and I want Salesforce to hold the unit for them now.</span>
              </label>
              {showErrors && !confirmed && <p className="mt-1 text-xs font-medium text-rose-700">Please confirm to continue.</p>}
              <div className="mt-4 space-y-3">
                <InlineError message={submitError} />
                {showErrors && !formValid && !submitError && (
                  <p role="alert" className="text-sm text-rose-800">
                    Some details are missing or invalid. Check the highlighted sections.
                  </p>
                )}
                <Button type="submit" size="lg" className="h-11 w-full text-base" disabled={submitting}>
                  {submitting ? 'Creating EOI…' : 'Create EOI and hold unit'}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Salesforce re-checks the price, plan, availability and your access before anything is saved. If another
                  colleague holds the unit first, nothing is created.
                </p>
              </div>
            </Section>
          </div>
        </div>
      </form>
    </>
  );
}

function Review({
  deal,
  unit,
  planName,
  discount,
  paymentMethod,
}: {
  deal: { customerName?: string } | null;
  unit: UnitDetail | null;
  planName?: string;
  discount: number | null;
  paymentMethod: string;
}) {
  const me = useMe();
  const listPrice = unit?.pricing.price?.listPrice;
  const rows: [string, string][] = [
    ['Customer', deal?.customerName ?? '—'],
    ['Unit', unit ? `${unit.name} · ${unit.projectName}` : '—'],
    ['Payment plan', planName ?? '—'],
    ['Payment method', PAYMENT_METHODS.find(m => m.value === paymentMethod)?.label ?? paymentMethod],
  ];
  return (
    <div className="space-y-4 text-sm">
      <dl className="space-y-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="rounded-lg bg-muted/60 p-3">
        <dl className="space-y-2">
          <div className="flex justify-between gap-3">
            <dt>Property list price</dt>
            <dd className="font-semibold">{money(listPrice, me.currencyCode)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Discount requested</dt>
            <dd className="font-semibold">{discount == null ? '—' : percent(discount)}</dd>
          </div>
          <div className="flex justify-between gap-3 text-muted-foreground">
            <dt>Net property price</dt>
            <dd>Set by Salesforce</dd>
          </div>
          <div className="flex justify-between gap-3 text-muted-foreground">
            <dt>Booking (reservation) fee</dt>
            <dd>Set by Salesforce</dd>
          </div>
          <div className="flex justify-between gap-3 text-muted-foreground">
            <dt>Tax</dt>
            <dd>Not recorded in Salesforce</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">Final amounts are shown as soon as Salesforce creates the EOI.</p>
      </div>
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">
        <Hourglass className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Unit hold starts today and runs for {me.eoiPeriodDays ?? '—'} days.
          {discount ? ' With a discount, the hold starts when the discount is approved.' : ''}
        </span>
      </div>
    </div>
  );
}

function SelectedUnit({ unit, currency, onChange }: { unit: UnitDetail; currency: string; onChange: () => void }) {
  const s = unitStatus(unit.status);
  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <div className="h-28 w-full overflow-hidden rounded-lg sm:w-44">
        <UnitPhoto file={unit.media.find(m => m.kind === 'image')} alt={`Unit ${unit.name}`} showMissingLabel={false} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-semibold text-brand-navy">
            {unit.unitType} {unit.name}
          </span>
          <StatusPill tone={s.tone}>{s.label}</StatusPill>
        </div>
        <div className="text-sm text-muted-foreground">
          {unit.projectName}
          {unit.buildingName ? ` · Building ${unit.buildingName}` : ''} · {unit.bedrooms ?? '—'} bed · {area(unit.builtUpArea)}
        </div>
        <div className="mt-1 font-semibold text-brand-navy">{money(unit.pricing.price?.listPrice, currency)}</div>
        <Button type="button" variant="link" className="h-auto px-0" onClick={onChange}>
          Choose a different unit
        </Button>
      </div>
    </div>
  );
}

function UnitPicker({
  preferredProjectId,
  dealId,
  onPick,
  currency,
}: {
  preferredProjectId?: string;
  dealId?: string;
  onPick: (id: string) => void;
  currency: string;
}) {
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQuery(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);
  const results = useApi(
    () => salesApi.units({ status: 'Available', search: query || undefined, projectId: preferredProjectId || undefined }),
    [query, preferredProjectId]
  );
  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <TextInput
          type="search"
          className="pl-9"
          aria-label="Search available units"
          placeholder="Search available units by unit or building"
          value={term}
          onChange={e => setTerm(e.target.value)}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {preferredProjectId ? "Showing available units in the deal's project. " : ''}
        Or{' '}
        <Link to={dealId ? `/units?dealId=${dealId}` : '/units'} className="font-medium text-brand-steel underline">
          browse units with filters
        </Link>
        {dealId ? ' (your customer stays selected)' : ''}.
      </p>
      <div className="mt-3">
        {results.loading && !results.data ? (
          <LoadingBlock rows={2} />
        ) : results.error ? (
          <ErrorState message={results.error} onRetry={results.reload} />
        ) : results.data && results.data.units.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">No available units match.</p>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {results.data?.units.map(u => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => onPick(u.id)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
                >
                  <span>
                    <span className="font-medium text-brand-navy">
                      {u.unitType} {u.name}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {u.projectName}
                      {u.buildingName ? ` · Bldg ${u.buildingName}` : ''} · {u.bedrooms ?? '—'} bed · {area(u.builtUpArea)}
                    </span>
                  </span>
                  <span className="font-semibold">{money(u.listPrice, currency)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CustomerForm({
  value,
  onChange,
  errors,
  cityOptions,
  today,
}: {
  value: CustomerInput;
  onChange: (c: CustomerInput) => void;
  errors: Partial<Record<keyof CustomerInput, string>>;
  cityOptions: { value: string; label: string }[];
  today: string;
}) {
  const field = (key: keyof CustomerInput) => ({
    value: value[key] ?? '',
    onChange: (e: { target: { value: string } }) => onChange({ ...value, [key]: e.target.value }),
  });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField label="Full name (Arabic)" required error={errors.fullNameArabic}>
        {p => <TextInput {...p} dir="auto" lang="ar" {...field('fullNameArabic')} />}
      </FormField>
      <FormField label="Mobile" required error={errors.mobile} hint="e.g. 07701234567 or +9647701234567">
        {p => <TextInput {...p} type="tel" inputMode="tel" autoComplete="off" {...field('mobile')} />}
      </FormField>
      <FormField label="National ID" required error={errors.nationalId} hint="12 digits">
        {p => <TextInput {...p} inputMode="numeric" maxLength={12} autoComplete="off" {...field('nationalId')} />}
      </FormField>
      <FormField label="National ID issue date" required error={errors.nationalIdDate}>
        {p => <TextInput {...p} type="date" max={today} {...field('nationalIdDate')} />}
      </FormField>
      <FormField label="Residence ID" error={errors.residenceId}>
        {p => <TextInput {...p} autoComplete="off" {...field('residenceId')} />}
      </FormField>
      <FormField label="Residence ID issue date" error={errors.residenceIdDate}>
        {p => <TextInput {...p} type="date" max={today} {...field('residenceIdDate')} />}
      </FormField>
      <FormField label="City" required error={errors.city}>
        {p => (
          <NativeSelect {...p} {...field('city')}>
            <option value="">Choose a city…</option>
            {cityOptions.map(c => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <FormField label="District" required error={errors.district}>
        {p => <TextInput {...p} {...field('district')} />}
      </FormField>
      <FormField label="Neighborhood" required error={errors.neighborhood}>
        {p => <TextInput {...p} {...field('neighborhood')} />}
      </FormField>
      <FormField label="Alley" required error={errors.alley}>
        {p => <TextInput {...p} {...field('alley')} />}
      </FormField>
      <FormField label="House number" required error={errors.houseNumber} className="sm:col-span-2 sm:w-1/2 sm:pr-2">
        {p => <TextInput {...p} {...field('houseNumber')} />}
      </FormField>
    </div>
  );
}

function Created({ result, dealId }: { result: EoiCreated; dealId: string }) {
  const me = useMe();
  const held = result.unitStatus === 'Held';
  return (
    <div className="mx-auto max-w-2xl">
      <Section>
        <div className="flex flex-col items-center py-4 text-center" role="status">
          <CheckCircle2 className="size-12 text-emerald-600" aria-hidden="true" />
          <h1 tabIndex={-1} className="mt-3 text-2xl font-semibold text-brand-navy outline-none">
            {result.replayed ? `EOI ${result.name} was already created` : `EOI ${result.name} created`}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {held
              ? `Unit ${result.unitName} is held for your customer until ${date(result.expiryDate)}.`
              : result.approvalStatus === 'Submitted' || (result.discountPct ?? 0) > 0
                ? `The discount was sent for approval. Unit ${result.unitName} is held once it is approved.`
                : `Unit ${result.unitName} status: ${unitStatus(result.unitStatus).label}.`}
          </p>
        </div>
        <dl className="mt-2 grid gap-3 rounded-lg bg-muted/60 p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Net property price</dt>
            <dd className="font-semibold">{money(result.netUnitPrice, me.currencyCode)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Booking (reservation) fee</dt>
            <dd className="font-semibold">{money(result.reservationFee, me.currencyCode)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Discount</dt>
            <dd className="font-semibold">{percent(result.discountPct)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Hold until</dt>
            <dd className="font-semibold">{date(result.expiryDate)}</dd>
          </div>
        </dl>
        <div className="mt-5 text-sm">
          <p className="font-medium text-brand-navy">Next steps</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>Have the customer sign the EOI document and pay the booking fee.</li>
            <li>The signed EOI is filed on the EOI in Salesforce, and finance confirms the payment.</li>
            <li>Once the EOI is paid, reserve the unit from the EOIs page.</li>
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">No document or email was sent by this app.</p>
        </div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button asChild size="lg" className="flex-1">
            <Link to={`/eois/${result.eoiId}`}>Open the EOI</Link>
          </Button>
          {dealId && (
            <Button asChild size="lg" variant="outline" className={cn('flex-1')}>
              <Link to={`/customers/${dealId}`}>Back to customer</Link>
            </Button>
          )}
        </div>
      </Section>
    </div>
  );
}
