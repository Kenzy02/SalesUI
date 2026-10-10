import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { FlaskConical, Mail, Smartphone } from 'lucide-react';
import { salesApi } from '@/api/salesApi';
import type {
  PortfolioUnitDetail,
  ScheduleLine,
  UnitMoney,
} from '@/api/salesTypes';
import { useDemoMode } from '@/components/app/DemoContext';
import { DemoBadge } from '@/components/app/DemoToggle';
import { GenerateEoiPdfButton } from '@/components/app/GenerateEoiPdf';
import { InfoTip } from '@/components/app/InfoTip';
import { useMe } from '@/components/app/MeContext';
import {
  BackLink,
  DetailList,
  ErrorState,
  LoadingBlock,
  PageHeader,
  Section,
  StatusPill,
} from '@/components/app/Primitives';
import {
  FLAG_TEXT,
  HiddenRecordsNote,
  InstallmentSummary,
  MoneyValue,
  SaleStatusPill,
  TIPS,
  Unavailable,
} from '@/components/app/Portfolio';
import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/useApi';
import { amount, date, percent, plural } from '@/lib/format';
import { demoCustomer, demoEoiDocument, isDemoId } from '@/lib/demo';
import { COUNT_ORDER, SALE_STATUS, unitStatusDetail } from '@/lib/portfolio';
import { DEAL_STAGE, EOI_STATUS, RESERVATION_STATUS } from '@/lib/salesLabels';

export default function CustomerPortfolioPage() {
  const { accountId = '' } = useParams();
  const me = useMe();
  const { demo, setDemo } = useDemoMode();
  const cur = me.currencyCode;
  const sample = isDemoId(accountId);
  const {
    data: c,
    loading,
    error,
    errorInfo,
    reload,
  } = useApi(
    () =>
      sample
        ? demo
          ? Promise.resolve(demoCustomer(me.today, accountId) ?? null)
          : Promise.resolve(null)
        : salesApi.customer(accountId),
    [accountId, sample, demo]
  );

  const live = c?.units.filter(u => u.saleStatus !== 'CLOSED') ?? [];
  const released = c?.units.filter(u => u.saleStatus === 'CLOSED') ?? [];
  const phone = c?.mobile ?? c?.phone;

  return (
    <>
      <BackLink to="/customers">Customers</BackLink>
      {sample && !demo ? (
        <Section>
          <p className="text-sm text-muted-foreground">
            This is a sample customer from demo mode.
          </p>
          <Button
            className="mt-3"
            variant="outline"
            onClick={() => setDemo(true)}
          >
            <FlaskConical /> Show demo data
          </Button>
        </Section>
      ) : loading && !c ? (
        <LoadingBlock rows={4} label="Loading customer" />
      ) : error && !c ? (
        <ErrorState
          message={error}
          status={errorInfo?.status}
          detail={errorInfo?.detail}
          onRetry={reload}
        />
      ) : c ? (
        <>
          <PageHeader
            eyebrow="Customer overview"
            title={
              <span className="inline-flex flex-wrap items-center gap-2">
                {c.name ?? 'Customer'} {sample && <DemoBadge />}
              </span>
            }
            description={
              <span className="inline-flex flex-wrap gap-1.5">
                {COUNT_ORDER.map(({ key, status }) => (
                  <StatusPill
                    key={key}
                    tone={
                      c.counts[key] > 0 ? SALE_STATUS[status].tone : 'neutral'
                    }
                  >
                    {c.counts[key]} {SALE_STATUS[status].plural}
                  </StatusPill>
                ))}
                {c.counts.closed > 0 && (
                  <StatusPill tone="neutral">
                    {c.counts.closed} released
                  </StatusPill>
                )}
              </span>
            }
            actions={
              <>
                {phone && (
                  <Button asChild variant="outline" size="lg">
                    <a href={`tel:${phone}`}>
                      <Smartphone /> <span dir="ltr">{phone}</span>
                    </a>
                  </Button>
                )}
                {c.email && (
                  <Button asChild variant="outline" size="lg">
                    <a href={`mailto:${c.email}`}>
                      <Mail /> {c.email}
                    </a>
                  </Button>
                )}
              </>
            }
          />

          <div className="space-y-6">
            <Section title="Payment summary">
              <DetailList
                columns={3}
                items={[
                  {
                    label: 'Confirmed paid',
                    tip: TIPS.confirmedPaid,
                    value: (
                      <MoneyValue
                        value={c.payments.confirmedPaid}
                        currency={cur}
                      />
                    ),
                  },
                  {
                    label: 'Booking fees confirmed',
                    value: (
                      <MoneyValue
                        value={c.payments.confirmedBookingFees}
                        currency={cur}
                      />
                    ),
                  },
                  {
                    label: c.payments.installmentsRecorded
                      ? 'Property payments'
                      : 'Deposits confirmed',
                    value: (
                      <MoneyValue
                        value={c.payments.confirmedDeposits}
                        currency={cur}
                      />
                    ),
                  },
                  {
                    label: 'Processed refunds',
                    value: c.payments.refunds ? (
                      `− ${amount(c.payments.refunds, cur)}`
                    ) : (
                      <MoneyValue value={c.payments.refunds} currency={cur} />
                    ),
                  },
                  {
                    label: 'Awaiting finance confirmation',
                    value: (
                      <MoneyValue
                        value={c.payments.pendingConfirmation}
                        currency={cur}
                      />
                    ),
                  },
                  {
                    label: 'Price of sold and reserved units',
                    value:
                      c.counts.sold + c.counts.reserved === 0 ? (
                        'No sold or reserved unit'
                      ) : (
                        <MoneyValue
                          value={c.payments.propertyPrice}
                          currency={cur}
                        />
                      ),
                  },
                  {
                    label: 'Remaining payable',
                    value: c.payments.installmentsRecorded ? (
                      <MoneyValue
                        value={c.payments.remainingPayable}
                        currency={cur}
                      />
                    ) : (
                      <NotRecorded />
                    ),
                  },
                  {
                    label: 'Overdue',
                    value: c.payments.installmentsRecorded ? (
                      c.payments.overdue ? (
                        <span className="text-rose-700">
                          {amount(c.payments.overdue, cur)}
                        </span>
                      ) : (
                        'None'
                      )
                    ) : (
                      <NotRecorded />
                    ),
                  },
                  {
                    label: 'Instalments',
                    value:
                      c.payments.installmentsRecorded &&
                      c.payments.installments ? (
                        <InstallmentSummary counts={c.payments.installments} />
                      ) : (
                        <NotRecorded />
                      ),
                  },
                  ...(c.payments.installmentsRecorded
                    ? [
                        {
                          label: 'Next payment',
                          value: c.payments.nextPayment ? (
                            <>
                              {amount(c.payments.nextPayment.amount, cur)}{' '}
                              <span className="text-xs text-muted-foreground">
                                {date(c.payments.nextPayment.dueDate)} ·{' '}
                                {c.payments.nextPayment.label}
                              </span>
                            </>
                          ) : (
                            'None due'
                          ),
                        },
                      ]
                    : []),
                ]}
              />
              {(c.hiddenRecords || c.flags.length > 0 || c.truncated) && (
                <div className="mt-4 space-y-1.5 border-t border-border pt-3">
                  {c.hiddenRecords && <HiddenRecordsNote />}
                  {c.flags.map(f => (
                    <p key={f} className="text-xs text-amber-900">
                      {FLAG_TEXT[f]}
                    </p>
                  ))}
                  {c.truncated && (
                    <p className="text-xs text-amber-900">
                      This customer has more records than can be combined here.
                    </p>
                  )}
                </div>
              )}
            </Section>

            {c.units.length === 0 ? (
              <Section title="Units">
                <p className="text-sm text-muted-foreground">
                  No EOI or reservation shared with you yet. Start one from a
                  deal below.
                </p>
              </Section>
            ) : (
              <div className="space-y-4">
                {live.map(u => (
                  <UnitSection
                    key={u.key}
                    unit={u}
                    currency={cur}
                    sample={sample}
                    customerId={c.id}
                  />
                ))}
                {released.length > 0 && (
                  <>
                    <h2 className="pt-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Released or cancelled ({released.length})
                    </h2>
                    {released.map(u => (
                      <UnitSection
                        key={u.key}
                        unit={u}
                        currency={cur}
                        sample={sample}
                        customerId={c.id}
                      />
                    ))}
                  </>
                )}
              </div>
            )}

            <Section
              title="Deals"
              description={`${plural(c.deals.length, 'deal')} shared with you.`}
            >
              <ul className="divide-y divide-border">
                {c.deals.map(d => {
                  const units = c.units
                    .filter(u => u.dealId === d.id)
                    .map(u => u.unitName)
                    .filter(Boolean);
                  return (
                    <li
                      key={d.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        {sample ? (
                          <span className="font-medium text-brand-navy">
                            {d.name ?? 'Deal'}
                          </span>
                        ) : (
                          <Link
                            to={`/customers/${d.id}`}
                            className="font-medium text-brand-navy hover:underline"
                          >
                            {d.name ?? 'Deal'}
                          </Link>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {units.length
                            ? `Unit ${units.join(', ')}`
                            : 'No unit yet'}{' '}
                          · {d.projectName ?? 'No project'}
                          {!d.isMine && d.ownerName
                            ? ` · Owner: ${d.ownerName}`
                            : ''}
                        </div>
                      </div>
                      {d.stage && (
                        <StatusPill tone={DEAL_STAGE[d.stage] ?? 'neutral'}>
                          {d.stage}
                        </StatusPill>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Section>
          </div>
        </>
      ) : null}
    </>
  );
}

function UnitSection({
  unit: u,
  currency,
  sample,
  customerId,
}: {
  unit: PortfolioUnitDetail;
  currency: string;
  sample: boolean;
  customerId: string;
}) {
  const me = useMe();
  const res = u.reservations[0];
  const eoiStatus = u.eoi?.status ? EOI_STATUS[u.eoi.status] : null;
  return (
    <Section
      title={`Unit ${u.unitName ?? '—'} · ${u.projectName ?? 'No project'}`}
      description={unitStatusDetail(u)}
      action={<SaleStatusPill status={u.saleStatus} />}
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <Block title="Sale">
            <DetailList
              items={[
                {
                  label: 'Sale status',
                  value: SALE_STATUS[u.saleStatus].label,
                },
                {
                  label: 'Sale date',
                  value:
                    u.saleStatus !== 'SOLD' ? (
                      'Not sold'
                    ) : u.saleDate ? (
                      date(u.saleDate)
                    ) : (
                      <Unavailable />
                    ),
                },
                {
                  label: 'Deal',
                  value: u.deal ? (
                    sample ? (
                      u.deal.name
                    ) : (
                      <Link
                        to={`/customers/${u.deal.id}`}
                        className="text-brand-steel underline"
                      >
                        {u.deal.name}
                      </Link>
                    )
                  ) : u.dealId ? (
                    <Unavailable>Not shared with you</Unavailable>
                  ) : (
                    <Unavailable />
                  ),
                },
                {
                  label: 'Payment plan',
                  value: u.paymentPlanName ?? <Unavailable />,
                },
              ]}
            />
          </Block>
          <Block title="EOI">
            {u.eoi ? (
              <DetailList
                items={[
                  {
                    label: 'Number',
                    value: (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        {sample ? (
                          u.eoi.name
                        ) : (
                          <Link
                            to={`/eois/${u.eoi.id}`}
                            className="text-brand-steel underline"
                          >
                            {u.eoi.name}
                          </Link>
                        )}
                        {eoiStatus && (
                          <StatusPill tone={eoiStatus.tone}>
                            {eoiStatus.label}
                          </StatusPill>
                        )}
                      </span>
                    ),
                  },
                  {
                    label: 'Hold until',
                    value:
                      u.saleStatus === 'EOI_HOLD'
                        ? date(u.eoi.expiryDate)
                        : '—',
                  },
                  {
                    label: 'Offer price',
                    value:
                      u.eoi.offerPrice != null ? (
                        amount(u.eoi.offerPrice, currency)
                      ) : (
                        <Unavailable />
                      ),
                  },
                  {
                    label: 'Discount',
                    value: u.eoi.discountPct
                      ? percent(u.eoi.discountPct, 1)
                      : 'None',
                  },
                  { label: 'Payment method', value: u.eoi.paymentMethod },
                  {
                    label: 'Signed EOI on file',
                    value: u.eoi.documentAttached ? 'Yes' : 'No',
                  },
                ]}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                No EOI for this unit.
              </p>
            )}
            {u.eoi && (
              <div className="mt-3">
                <GenerateEoiPdfButton
                  size="sm"
                  eoiId={sample ? undefined : u.eoi.id}
                  demoData={
                    sample
                      ? demoEoiDocument(me.today, customerId, u.key)
                      : undefined
                  }
                />
              </div>
            )}
          </Block>
          <Block title="Reservation">
            {res ? (
              <DetailList
                items={[
                  {
                    label: 'Number',
                    value: (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        {res.name}
                        {res.status && RESERVATION_STATUS[res.status] && (
                          <StatusPill
                            tone={RESERVATION_STATUS[res.status]!.tone}
                          >
                            {RESERVATION_STATUS[res.status]!.label}
                          </StatusPill>
                        )}
                      </span>
                    ),
                  },
                  {
                    label: 'Hold until',
                    value:
                      u.saleStatus === 'RESERVED' ? date(res.holdExpiry) : '—',
                  },
                  {
                    label: 'List price',
                    value:
                      res.listPrice != null ? (
                        amount(res.listPrice, currency)
                      ) : (
                        <Unavailable />
                      ),
                  },
                  {
                    label: 'Net price',
                    value:
                      res.netPrice != null ? (
                        amount(res.netPrice, currency)
                      ) : (
                        <Unavailable />
                      ),
                  },
                ]}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {u.saleStatus === 'EOI_HOLD'
                  ? 'Not reserved yet.'
                  : 'No reservation.'}
              </p>
            )}
            {u.reservations.length > 1 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Earlier reservations:{' '}
                {u.reservations
                  .slice(1)
                  .map(
                    r =>
                      `${r.name} (${RESERVATION_STATUS[r.status ?? '']?.label ?? r.status})`
                  )
                  .join(', ')}
              </p>
            )}
          </Block>
        </div>
        <Block title="Payments">
          {u.money ? (
            <PaymentsTable unit={u} money={u.money} currency={currency} />
          ) : (
            <Unavailable>
              Payment fields aren&rsquo;t visible to you
            </Unavailable>
          )}
        </Block>
      </div>
    </Section>
  );
}

function PaymentsTable({
  unit: u,
  money: m,
  currency,
}: {
  unit: PortfolioUnitDetail;
  money: UnitMoney;
  currency: string;
}) {
  const res = u.reservations[0];
  const committed = u.saleStatus === 'SOLD' || u.saleStatus === 'RESERVED';
  const feeState = !u.eoi
    ? null
    : m.bookingFeeConfirmed
      ? 'confirmed'
      : m.pendingBookingFee > 0
        ? 'pending'
        : 'none';
  const depositState = !res
    ? null
    : m.confirmedTowardPrice > 0 || (res.depositVerified && committed)
      ? 'confirmed'
      : m.pendingDeposits > 0
        ? 'pending'
        : 'none';
  return (
    <div className="space-y-3">
      <table className="w-full text-sm">
        <caption className="sr-only">Payments for unit {u.unitName}</caption>
        <tbody className="divide-y divide-border">
          <PayRow
            label="Booking fee"
            hint="Charged on top of the price"
            value={
              u.eoi ? (
                m.bookingFee != null ? (
                  amount(m.bookingFee, currency)
                ) : (
                  <Unavailable />
                )
              ) : (
                '—'
              )
            }
            state={feeState}
            stateDate={m.bookingFeeConfirmedDate}
          />
          {u.schedule ? (
            <PayRow
              label="Property payments"
              hint="Down payment and instalments"
              value={amount(
                m.pendingDeposits > 0 ? m.pendingDeposits : m.confirmedDeposits,
                currency
              )}
              state={m.pendingDeposits > 0 ? 'pending' : 'confirmed'}
            />
          ) : (
            <PayRow
              label="Deposit"
              hint="Counts toward the price"
              value={
                res ? (
                  res.deposit != null ? (
                    amount(res.deposit, currency)
                  ) : (
                    <Unavailable />
                  )
                ) : (
                  '—'
                )
              }
              state={depositState}
              stateDate={res?.depositVerifiedDate}
            />
          )}
          {m.refunds > 0 && (
            <PayRow
              label="Refunded"
              hint={
                u.refunds.map(r => r.name).join(', ') || 'Recorded on the EOI'
              }
              value={`− ${amount(m.refunds, currency)}`}
              state={null}
            />
          )}
          <tr className="font-semibold text-brand-navy">
            <th scope="row" className="py-2.5 pr-3 text-left">
              Confirmed paid
            </th>
            <td className="py-2.5 text-right" colSpan={2}>
              {amount(m.netConfirmed, currency)}
            </td>
          </tr>
        </tbody>
      </table>
      {committed && (
        <DetailList
          items={[
            {
              label: 'Net price',
              value: <MoneyValue value={m.price} currency={currency} />,
            },
            {
              label: 'Paid toward the price',
              value: amount(m.confirmedTowardPrice, currency),
            },
            {
              label: 'Remaining payable',
              value:
                u.schedule && m.price != null ? (
                  amount(m.price - m.confirmedTowardPrice, currency)
                ) : (
                  <NotRecorded />
                ),
            },
            ...(u.schedule
              ? []
              : [{ label: 'Instalments', value: <NotRecorded /> }]),
          ]}
        />
      )}
      {u.schedule && u.schedule.length > 0 && (
        <Schedule lines={u.schedule} currency={currency} unit={u.unitName} />
      )}
      {m.excludedDeposits > 0 && (
        <p className="text-xs text-amber-900">
          {amount(m.excludedDeposits, currency)} not counted.{' '}
          {FLAG_TEXT.POSSIBLE_CARRIED_DEPOSIT}
        </p>
      )}
      {m.flags.includes('EXPIRED_FEE_NOT_REFUNDED') && (
        <p className="text-xs text-amber-900">
          {FLAG_TEXT.EXPIRED_FEE_NOT_REFUNDED}
        </p>
      )}
    </div>
  );
}

function PayRow({
  label,
  hint,
  value,
  state,
  stateDate,
}: {
  label: string;
  hint: string;
  value: ReactNode;
  state: 'confirmed' | 'pending' | 'none' | null;
  stateDate?: string;
}) {
  return (
    <tr className="align-top">
      <th scope="row" className="py-2.5 pr-3 text-left font-normal">
        <div className="font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </th>
      <td className="py-2.5 pr-3 text-right tabular-nums">{value}</td>
      <td className="w-32 py-2.5 text-right">
        {state === 'confirmed' ? (
          <span className="text-xs text-emerald-800">
            Confirmed{stateDate ? ` ${date(stateDate)}` : ''}
          </span>
        ) : state === 'pending' ? (
          <StatusPill tone="warning">Awaiting finance</StatusPill>
        ) : state === 'none' ? (
          <span className="text-xs text-muted-foreground">Not paid</span>
        ) : null}
      </td>
    </tr>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-steel">
        {title}
      </h3>
      {children}
    </div>
  );
}

function NotRecorded() {
  return (
    <span className="inline-flex items-center gap-1">
      <Unavailable />
      <InfoTip label="Why not recorded">{TIPS.notRecorded}</InfoTip>
    </span>
  );
}

const SCHEDULE_STATUS: Record<
  ScheduleLine['status'],
  { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  PAID: { label: 'Paid', tone: 'success' },
  PARTIAL: { label: 'Part paid', tone: 'warning' },
  OVERDUE: { label: 'Overdue', tone: 'danger' },
  UPCOMING: { label: 'Upcoming', tone: 'neutral' },
};

function Schedule({
  lines,
  currency,
  unit,
}: {
  lines: ScheduleLine[];
  currency: string;
  unit?: string;
}) {
  return (
    <div className="relative overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[22rem] text-sm">
        <caption className="sr-only">Payment schedule for unit {unit}</caption>
        <thead className="bg-muted/60 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Payment
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Due
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Amount
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Paid
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              <span className="sr-only">Status</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {lines.map(l => (
            <tr key={l.key}>
              <td className="px-3 py-2">{l.label}</td>
              <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                {date(l.dueDate)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {amount(l.amount, currency)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {l.paid ? amount(l.paid, currency) : '—'}
              </td>
              <td className="px-3 py-2 text-right">
                <StatusPill tone={SCHEDULE_STATUS[l.status].tone}>
                  {SCHEDULE_STATUS[l.status].label}
                </StatusPill>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
