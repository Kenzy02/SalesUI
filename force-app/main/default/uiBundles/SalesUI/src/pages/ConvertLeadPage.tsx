import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ArrowRight, CheckCircle2, ShieldAlert, UserPlus, Users } from 'lucide-react';
import { ApiError, salesApi } from '@/api/salesApi';
import type { ConversionResult, ConversionReview, ConvertInput, CustomerMatch } from '@/api/salesTypes';
import { BookingSteps } from '@/components/app/BookingSteps';
import { FormField, TextInput } from '@/components/app/FormControls';
import { useMe } from '@/components/app/MeContext';
import { BackLink, EmptyState, ErrorState, InlineError, LoadingBlock, PageHeader, Section, StatusPill } from '@/components/app/Primitives';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/useApi';
import { eoiAfterConversionLink, journeyQuery } from '@/lib/booking';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';

type Details = Required<Pick<ConvertInput, 'firstName' | 'lastName' | 'mobile' | 'email' | 'nationalId'>>;

/** Same checks Salesforce applies (lead and account validation rules); the server re-checks everything. */
function detailErrors(d: Details, nationalIdEditable: boolean): Partial<Record<keyof Details, string>> {
  const e: Partial<Record<keyof Details, string>> = {};
  if (!d.lastName.trim()) e.lastName = 'Required';
  const m = d.mobile.trim();
  if (!m) e.mobile = 'Required';
  else if (!(/^07[5789]\d{8}$/.test(m) || ((m.startsWith('+') || m.startsWith('00')) && m.length >= 12 && m.length <= 16))) {
    e.mobile = 'Iraqi mobiles start with 075, 077, 078 or 079 (11 digits); international numbers start with + or 00.';
  }
  if (nationalIdEditable && d.nationalId.trim() && !/^\d{12}$/.test(d.nationalId.trim())) e.nationalId = 'Must be exactly 12 digits, or empty.';
  if (d.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) e.email = 'Enter a valid email address.';
  return e;
}

export default function ConvertLeadPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const unitId = params.get('unitId') ?? '';
  const planId = params.get('planId') ?? '';
  const review = useApi(() => salesApi.conversion(id), [id]);
  const unit = useApi(() => (unitId ? salesApi.unit(unitId) : Promise.resolve(null)), [unitId]);
  const backToUnit = unitId ? `/units/${unitId}${journeyQuery(params, { leadId: id, unitId: null })}` : `/leads/${id}`;

  const data = review.data;
  return (
    <>
      <BackLink to={backToUnit}>{unitId ? 'Back to the unit' : 'Back to the lead'}</BackLink>
      <BookingSteps current="customer" withConversion />
      {review.loading && !data ? (
        <LoadingBlock rows={4} label="Loading the lead" />
      ) : review.error && !data ? (
        <ErrorState message={review.error} status={review.errorInfo?.status} detail={review.errorInfo?.detail} onRetry={review.reload} />
      ) : data?.converted ? (
        <Converted result={data} params={params} unitId={unitId} />
      ) : data ? (
        <ReviewForm
          review={data}
          params={params}
          unitId={unitId}
          unitLabel={unit.data ? `${unit.data.unitType ?? 'Unit'} ${unit.data.name} · ${unit.data.projectName}` : undefined}
          listPrice={unit.data?.pricing.price?.listPrice}
          planName={unit.data?.pricing.plans?.find(p => p.id === planId)?.name}
        />
      ) : null}
    </>
  );
}

function ReviewForm({
  review,
  params,
  unitId,
  unitLabel,
  listPrice,
  planName,
}: {
  review: ConversionReview;
  params: URLSearchParams;
  unitId: string;
  unitLabel?: string;
  listPrice?: number;
  planName?: string;
}) {
  const me = useMe();
  const navigate = useNavigate();
  const [details, setDetails] = useState<Details>({
    firstName: review.firstName ?? '',
    lastName: review.lastName ?? '',
    mobile: review.mobile ?? '',
    email: review.email ?? '',
    nationalId: review.nationalId ?? '',
  });
  const [matches, setMatches] = useState<CustomerMatch[]>(review.matches);
  const [otherLeads, setOtherLeads] = useState(review.duplicateLeads);
  const [checking, setChecking] = useState(false);
  const linked = matches.find(m => m.isLinkedBuyer);
  const newBlocked = linked != null || matches.some(m => m.blocksNewCustomer);
  // '' = create a new customer; otherwise an existing customer's account id.
  const [accountChoice, setAccountId] = useState<string>(linked?.id ?? (newBlocked ? (matches.find(m => m.canUse)?.id ?? '') : ''));
  const [dealChoice, setDealId] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const inFlight = useRef(false);
  const checked = useRef({ mobile: review.mobile ?? '', nationalId: review.nationalId ?? '' });

  const errors = detailErrors(details, review.canEditNationalId);
  // Choices stay valid when a re-check changes the matches: a customer that is no longer listed falls back.
  const accountId = accountChoice && matches.some(m => m.id === accountChoice) ? accountChoice : (linked?.id ?? '');
  const chosen = matches.find(m => m.id === accountId);
  const dealId = chosen?.openDeals.some(o => o.id === dealChoice && o.canUse) ? dealChoice : '';
  const choiceError = accountId === '' && newBlocked ? 'Choose the existing customer.' : chosen && !chosen.canUse ? "You can't use this customer." : null;
  const valid = review.canConvert && Object.keys(errors).length === 0 && !choiceError;

  /** Re-run the org's duplicate check when the mobile or national ID is corrected. */
  const recheck = async () => {
    const mobile = details.mobile.trim();
    const nationalId = details.nationalId.trim();
    if (mobile === checked.current.mobile && nationalId === checked.current.nationalId) return;
    if (errors.mobile || errors.nationalId) return;
    checked.current = { mobile, nationalId };
    setChecking(true);
    try {
      const r = await salesApi.conversionMatches(review.leadId, mobile, nationalId || undefined);
      setMatches(r.matches);
      setOtherLeads(r.duplicateLeads);
    } catch {
      // The server checks again on convert; a failed preview is not fatal.
    } finally {
      setChecking(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setShowErrors(true);
    if (!valid || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await salesApi.convertLead(review.leadId, {
        firstName: details.firstName.trim() || undefined,
        lastName: details.lastName.trim(),
        mobile: details.mobile.trim(),
        email: details.email.trim() || undefined,
        nationalId: review.canEditNationalId ? details.nationalId.trim() || undefined : undefined,
        accountId: accountId || undefined,
        dealId: accountId && dealId ? dealId : undefined,
      });
      if (r.dealId && r.canContinue) {
        // Straight on to the EOI form; replace so "Back" can't resubmit the conversion.
        navigate(eoiAfterConversionLink(params, r.dealId, unitId), { replace: true });
        return;
      }
      setResult(r);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'The lead could not be converted.');
      if (err instanceof ApiError && err.status === 400) {
        checked.current = { mobile: '', nationalId: '' };
        void recheck();
      }
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  if (result) return <Converted result={result} params={params} unitId={unitId} />;

  const name = [review.firstName, review.lastName].filter(Boolean).join(' ') || 'this lead';
  if (!review.canConvert) {
    return (
      <Section>
        <EmptyState icon={<ShieldAlert className="size-5" />} title={`${name} can't be converted here`}>
          {review.blockers[0]}
        </EmptyState>
      </Section>
    );
  }

  const set = (key: keyof Details) => ({
    value: details[key],
    onChange: (e: { target: { value: string } }) => setDetails({ ...details, [key]: e.target.value }),
  });

  return (
    <>
      <PageHeader
        eyebrow="Booking · Convert lead"
        title={`Convert ${name} into a customer`}
        description="Confirm who the buyer is. Salesforce converts the lead into a customer and a deal, then you go straight on to the EOI for the unit and plan you chose."
      />
      <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Section title="1. Customer details" description="Saved on the lead and carried to the customer by Salesforce's lead conversion mapping.">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="First name" error={showErrors ? errors.firstName : null}>
                {p => <TextInput {...p} dir="auto" autoComplete="off" {...set('firstName')} />}
              </FormField>
              <FormField label="Last name" required error={showErrors ? errors.lastName : null}>
                {p => <TextInput {...p} dir="auto" autoComplete="off" {...set('lastName')} />}
              </FormField>
              <FormField label="Mobile" required error={showErrors || details.mobile !== (review.mobile ?? '') ? errors.mobile : null} hint="e.g. 07701234567 or +9647701234567">
                {p => <TextInput {...p} type="tel" inputMode="tel" autoComplete="off" {...set('mobile')} onBlur={recheck} />}
              </FormField>
              <FormField label="Email" error={showErrors ? errors.email : null}>
                {p => <TextInput {...p} type="email" autoComplete="off" {...set('email')} />}
              </FormField>
              {review.canEditNationalId && (
                <FormField label="National ID" error={showErrors || details.nationalId !== (review.nationalId ?? '') ? errors.nationalId : null} hint="12 digits. Optional now; required on the EOI.">
                  {p => <TextInput {...p} inputMode="numeric" maxLength={12} autoComplete="off" {...set('nationalId')} onBlur={recheck} />}
                </FormField>
              )}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              {review.company
                ? `Recorded on the lead as "${review.company}", meaning an individual buyer: Salesforce creates a personal customer record (person account), not a company.`
                : 'Salesforce creates a personal customer record (person account) for the buyer.'}
            </p>
          </Section>

          <Section
            title="2. New or existing customer"
            description="Checked with Salesforce's duplicate check on mobile, phone and national ID, the same check Lead Quick Create uses."
            action={checking ? <span className="text-xs text-muted-foreground" role="status">Checking…</span> : undefined}
          >
            <fieldset className="space-y-3">
              <legend className="sr-only">Customer</legend>
              <ChoiceCard
                checked={accountId === ''}
                disabled={newBlocked}
                onSelect={() => setAccountId('')}
                icon={<UserPlus className="size-4" aria-hidden="true" />}
                title="Create a new customer and deal"
                detail={
                  linked
                    ? 'Not available: this lead is linked to an existing customer, and Salesforce requires converting into that customer.'
                    : newBlocked
                      ? 'Not available: Salesforce allows one customer per mobile number and national ID, and a customer below already has them.'
                      : `A new customer for ${name}, with a new deal${review.projectInterest ? ` (recorded interest: ${review.projectInterest})` : ''}.`
                }
              />
              {matches.map(m => (
                <ChoiceCard
                  key={m.id}
                  checked={accountId === m.id}
                  disabled={!m.canUse || (linked != null && !m.isLinkedBuyer)}
                  onSelect={() => setAccountId(m.id)}
                  icon={<Users className="size-4" aria-hidden="true" />}
                  title={m.name ?? 'Customer'}
                  badges={
                    <>
                      {m.isLinkedBuyer && <StatusPill tone="brand">Linked to this lead</StatusPill>}
                      {m.matchedOn.map(r => (
                        <StatusPill key={r} tone="info">
                          Same {r}
                        </StatusPill>
                      ))}
                    </>
                  }
                  detail={[
                    m.mobile && `Mobile ${m.mobile}`,
                    m.nationalIdEnding && `National ID ending ${m.nationalIdEnding}`,
                    m.ownerName && `Owner ${m.ownerName}`,
                    !m.canUse && "You can't edit this customer",
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                >
                  {accountId === m.id && (
                    <fieldset className="mt-3 space-y-2 border-t border-border pt-3">
                      <legend className="mb-1 text-xs font-medium text-brand-navy">Deal for this booking</legend>
                      <label className="flex items-start gap-2 text-sm">
                        <input type="radio" name="deal" className="mt-0.5 size-4 accent-[#1f2a5c]" checked={dealId === ''} onChange={() => setDealId('')} />
                        <span>Start a new deal for this customer</span>
                      </label>
                      {m.openDeals.map(d => (
                        <label key={d.id} className={cn('flex items-start gap-2 text-sm', !d.canUse && 'text-muted-foreground')}>
                          <input
                            type="radio"
                            name="deal"
                            className="mt-0.5 size-4 accent-[#1f2a5c]"
                            checked={dealId === d.id}
                            disabled={!d.canUse}
                            onChange={() => setDealId(d.id)}
                          />
                          <span>
                            Continue open deal <span className="font-medium">{d.name}</span>
                            {d.stage ? ` (${d.stage})` : ''}
                            {!d.canUse && (d.hasEoi ? ' · already has an EOI' : " · you can't edit it")}
                          </span>
                        </label>
                      ))}
                    </fieldset>
                  )}
                </ChoiceCard>
              ))}
            </fieldset>
            {showErrors && choiceError && <p className="mt-2 text-sm font-medium text-rose-700">{choiceError}</p>}
            {matches.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No existing customer has this mobile number or national ID.</p>}
            {otherLeads.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Other open leads with the same details: {otherLeads.map(l => `${l.name}${l.ownerName ? ` (${l.ownerName})` : ''}`).join(', ')}. They are not
                changed.
              </p>
            )}
          </Section>
        </div>

        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-32">
            <Section title="3. Convert and continue">
              <dl className="space-y-2 text-sm">
                {[
                  ['Unit', unitLabel ?? (unitId ? '…' : 'Choose after conversion')],
                  ['List price', listPrice != null ? money(listPrice, me.currencyCode) : '—'],
                  ['Payment plan', planName ?? 'Choose on the EOI'],
                  ['Customer', chosen ? `${chosen.name} (existing)` : 'New customer'],
                  ['Deal', chosen && dealId ? (chosen.openDeals.find(d => d.id === dealId)?.name ?? '—') : 'New deal'],
                  ['Lead status after', review.convertedStatus],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="text-right font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 space-y-3">
                <InlineError message={submitError} />
                {showErrors && !valid && !submitError && (
                  <p role="alert" className="text-sm text-rose-800">
                    Some details are missing or invalid.
                  </p>
                )}
                <Button type="submit" size="lg" className="h-11 w-full text-base" disabled={submitting}>
                  {submitting ? 'Converting…' : (
                    <>
                      Convert lead and continue <ArrowRight />
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Conversion can't be undone here. Nothing is held yet: the unit is held when you create the EOI on the next
                  step. If the EOI can't be created, the customer and deal are kept and you can try again without converting
                  again.
                </p>
              </div>
            </Section>
          </div>
        </div>
      </form>
    </>
  );
}

function ChoiceCard({
  checked,
  disabled,
  onSelect,
  icon,
  title,
  detail,
  badges,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  icon: ReactNode;
  title: string;
  detail?: string;
  badges?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-white p-3 transition-colors',
        checked ? 'border-brand-navy ring-2 ring-brand-navy/15' : 'border-border',
        disabled && 'opacity-70'
      )}
    >
      <label className={cn('flex items-start gap-3', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
        <input type="radio" name="customer" className="mt-1 size-4 accent-[#1f2a5c]" checked={checked} disabled={disabled} onChange={onSelect} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-brand-steel">{icon}</span>
            <span className="font-medium text-brand-navy">{title}</span>
            {badges}
          </span>
          {detail && <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>}
        </span>
      </label>
      {children}
    </div>
  );
}

/** A lead that is (already, or just) converted: show the records and continue on the deal. */
function Converted({ result, params, unitId }: { result: ConversionResult; params: URLSearchParams; unitId: string }) {
  return (
    <Section>
      <div className="flex flex-col items-center py-4 text-center" role="status">
        <CheckCircle2 className="size-10 text-emerald-600" aria-hidden="true" />
        <h1 tabIndex={-1} className="mt-3 text-xl font-semibold text-brand-navy outline-none">
          {result.replayed ? 'This lead is already converted' : 'Lead converted'}
        </h1>
        <p className="mt-1 max-w-lg text-sm text-muted-foreground">
          Customer <span className="font-medium text-brand-navy">{result.customerName ?? '—'}</span>
          {result.dealName ? (
            <>
              {' '}
              · deal <span className="font-medium text-brand-navy">{result.dealName}</span>
            </>
          ) : null}
          . Nothing was converted again.
        </p>
      </div>
      <div className="mx-auto max-w-lg space-y-3 pb-2 text-sm">
        {result.dealId && result.canContinue ? (
          <Button asChild size="lg" className="w-full">
            <Link to={eoiAfterConversionLink(params, result.dealId, unitId)} replace>
              Continue to the EOI <ArrowRight />
            </Link>
          </Button>
        ) : result.dealId ? (
          <>
            <p className="text-center text-muted-foreground">
              {result.dealHasEoi
                ? 'This deal already has an EOI, so a new one cannot start from it.'
                : result.dealIsClosed
                  ? 'This deal is closed, so a new EOI cannot start from it.'
                  : "You can't edit this deal, so you can't book on it."}
            </p>
            <Button asChild size="lg" variant="outline" className="w-full">
              <Link to={`/customers/${result.dealId}`}>Open the customer</Link>
            </Button>
          </>
        ) : (
          <>
            <p className="text-center text-muted-foreground">
              The lead was converted without a deal you can continue. Open the customer list to choose the right deal.
            </p>
            <Button asChild size="lg" variant="outline" className="w-full">
              <Link to="/customers">Open Customers</Link>
            </Button>
          </>
        )}
      </div>
    </Section>
  );
}
