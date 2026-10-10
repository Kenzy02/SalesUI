/**
 * The EOI document as A4 pages (794 × 1123 CSS px at 96 dpi), bilingual,
 * Arabic first and right to left. The same nodes are shown as the preview and
 * rendered into the PDF, so what the user previews is what they download.
 *
 * No bank details, declaration, refund conditions or contractual terms are
 * printed: none are recorded in Salesforce, so the document is a labelled
 * draft with a space for the approved wording.
 */
import { forwardRef, type ReactNode } from 'react';
import logo from '@/assets/brand/amwaj-logo.jpeg';
import { AR, eoiPricing, type EoiDocumentData } from '@/lib/eoiDocument';

export const A4_WIDTH = 794;
export const A4_HEIGHT = 1123;

const css = `
.eoidoc { font-family: 'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif; color: #1b2340; }
.eoidoc-page { position: relative; width: ${A4_WIDTH}px; height: ${A4_HEIGHT}px; background: #fff; overflow: hidden;
  padding: 44px 48px 0; box-sizing: border-box; display: flex; flex-direction: column; }
.eoidoc-page * { box-sizing: border-box; }
.eoidoc-mark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 0; }
.eoidoc-mark span { transform: rotate(-30deg); font-size: 92px; font-weight: 700; letter-spacing: 0; white-space: nowrap; }
.eoidoc-mark.draft span { color: rgba(31, 42, 92, 0.045); }
.eoidoc-mark.demo span { color: rgba(190, 70, 30, 0.10); }
.eoidoc-body { position: relative; z-index: 1; flex: 1; }
.eoidoc-head { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding-bottom: 16px; border-bottom: 3px solid #1f2a5c; }
.eoidoc-head img { height: 54px; width: auto; }
.eoidoc-title { text-align: right; }
.eoidoc-title h1 { margin: 0; font-size: 21px; font-weight: 700; color: #1f2a5c; line-height: 1.35; }
.eoidoc-title p { margin: 2px 0 0; font-size: 12px; color: #4a78a8; font-weight: 600; letter-spacing: 0.02em; }
.eoidoc-project { margin-top: 6px; font-size: 13px; color: #1b2340; }
.eoidoc-ribbon { margin-top: 12px; padding: 7px 12px; border-radius: 6px; font-size: 11.5px; line-height: 1.5; display: flex; justify-content: space-between; gap: 12px; }
.eoidoc-ribbon.draft { background: #f3f5fa; border: 1px solid #d7deeb; color: #3a4466; }
.eoidoc-ribbon.demo { background: #fff3ec; border: 1px solid #f2c4a8; color: #8a3410; font-weight: 600; }
.eoidoc-meta { margin-top: 14px; display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid #c9d2e3; border-radius: 8px; overflow: hidden; }
.eoidoc-meta > div { padding: 8px 12px; border-left: 1px solid #c9d2e3; }
.eoidoc-meta > div:last-child { border-left: 0; }
.eoidoc-k { font-size: 11px; color: #5b6685; line-height: 1.35; }
.eoidoc-k b { font-weight: 600; color: #1f2a5c; font-size: 12px; }
.eoidoc-v { margin-top: 2px; font-size: 14px; font-weight: 600; color: #1b2340; }
.eoidoc-sec { margin-top: 18px; }
.eoidoc-sec h2 { margin: 0 0 7px; font-size: 15px; font-weight: 700; color: #1f2a5c; display: flex; align-items: baseline; gap: 8px; }
.eoidoc-sec h2 small { font-size: 11px; font-weight: 600; color: #4a78a8; }
.eoidoc-grid { display: grid; gap: 6px; }
.eoidoc-grid.c2 { grid-template-columns: 1fr 1fr; }
.eoidoc-grid.c3 { grid-template-columns: 1fr 1fr 1fr; }
.eoidoc-row { display: flex; min-height: 40px; border: 1px solid #c9d2e3; border-radius: 6px; overflow: hidden; }
.eoidoc-row .l { flex: 0 0 auto; width: 132px; background: #1f2a5c; color: #fff; padding: 5px 10px; display: flex; flex-direction: column; justify-content: center; }
.eoidoc-row .l span { font-size: 12.5px; font-weight: 600; line-height: 1.3; }
.eoidoc-row .l em { display: block; text-align: right; font-style: normal; font-size: 9.5px; opacity: 0.8; line-height: 1.25; }
.eoidoc-row .val { flex: 1; padding: 5px 12px; display: flex; flex-direction: column; justify-content: center; font-size: 13.5px; font-weight: 500; min-width: 0; }
.eoidoc-row.wide .l { width: 160px; }
.eoidoc-grid.c3 .eoidoc-row .l { width: 104px; }
.eoidoc-row.strong .val { font-size: 15.5px; font-weight: 700; color: #1f2a5c; }
.eoidoc-none { color: #9aa3b8; font-weight: 400; }
.eoidoc-note { font-size: 10.5px; color: #5b6685; font-weight: 400; line-height: 1.4; margin-top: 1px; }
.eoidoc-note[dir='ltr'] { text-align: right; }
.eoidoc-ltr { direction: ltr; unicode-bidi: isolate; display: inline-block; }
.eoidoc-terms { border: 1.5px dashed #9aa8c6; border-radius: 8px; padding: 14px 16px; min-height: 150px; background: #fafbfd; }
.eoidoc-terms p { margin: 0 0 6px; font-size: 12.5px; line-height: 1.6; }
.eoidoc-terms p.en { direction: ltr; text-align: left; font-size: 11.5px; color: #3a4466; }
.eoidoc-sign { border: 1px solid #c9d2e3; border-radius: 8px; padding: 10px 12px; }
.eoidoc-sign h3 { margin: 0 0 8px; font-size: 13px; font-weight: 700; color: #1f2a5c; }
.eoidoc-sign h3 small { font-weight: 600; color: #4a78a8; font-size: 10.5px; margin-right: 6px; }
.eoidoc-line { display: flex; align-items: flex-end; gap: 8px; margin-top: 10px; font-size: 11px; color: #5b6685; }
.eoidoc-line span:first-child { white-space: nowrap; }
.eoidoc-line .fill { flex: 1; border-bottom: 1px solid #8792ad; min-height: 22px; font-size: 13px; color: #1b2340; font-weight: 600; padding: 0 2px 2px; }
.eoidoc-line.sig .fill { min-height: 44px; }
.eoidoc-foot-line { display: block; line-height: 1.5; }
.eoidoc-foot-page { text-align: left; white-space: nowrap; }
.eoidoc-en { display: block; direction: ltr; text-align: right; font-size: 10px; }
.eoidoc-foot { position: relative; z-index: 1; display: flex; justify-content: space-between; gap: 16px; padding: 10px 0 18px; margin-top: 12px; border-top: 1px solid #d7deeb; font-size: 9.5px; color: #6b7590; }
`;

export interface EoiDocumentProps {
  data: EoiDocumentData;
  currency: string;
  /** ISO timestamp of generation, printed in the footer. */
  generatedAt: string;
  /** Simulated data: marked "Demo / Sample" on every page. */
  demo?: boolean;
}

/** Two A4 pages; the ref receives the container whose `.eoidoc-page` children are rendered to the PDF. */
export const EoiDocument = forwardRef<HTMLDivElement, EoiDocumentProps>(
  function EoiDocument({ data, currency, generatedAt, demo }, ref) {
    const { eoi, customer: c } = data;
    const price = eoiPricing(eoi);
    const pages = 2;
    const amt = (v: number | undefined) =>
      v == null
        ? null
        : new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency,
            currencyDisplay: 'code',
            minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
            maximumFractionDigits: 2,
          }).format(v);
    const statusAr = AR.status[eoi.status ?? ''];
    const methodAr = AR.paymentMethod[eoi.paymentMethod ?? ''];
    const projectLine = [eoi.projectNameAr, eoi.projectName]
      .filter(Boolean)
      .join(' · ');
    const building = [eoi.buildingNameAr, eoi.buildingName]
      .filter(Boolean)
      .join(' · ');

    const page = (n: number, children: ReactNode) => (
      <section
        className="eoidoc-page"
        dir="rtl"
        lang="ar"
        aria-label={`Page ${n} of ${pages}`}
      >
        <div
          className={demo ? 'eoidoc-mark demo' : 'eoidoc-mark draft'}
          aria-hidden="true"
        >
          <span>{demo ? 'DEMO · عرض تجريبي' : 'مسودة · DRAFT'}</span>
        </div>
        <div className="eoidoc-body">{children}</div>
        <footer className="eoidoc-foot">
          <span>
            <span className="eoidoc-foot-line">
              صادرة من سجل Salesforce رقم <Ltr>{eoi.name}</Ltr> بتاريخ{' '}
              <Ltr>{dmy(generatedAt)}</Ltr> — غير موقَّعة
            </span>
            <span className="eoidoc-foot-line" dir="ltr">
              Generated from Salesforce record {eoi.name} on {dmy(generatedAt)}{' '}
              — unsigned
            </span>
          </span>
          <span className="eoidoc-foot-page">
            <span className="eoidoc-foot-line">
              صفحة <Ltr>{n}</Ltr> من <Ltr>{pages}</Ltr>
            </span>
            <span className="eoidoc-foot-line" dir="ltr">
              Page {n} of {pages}
            </span>
          </span>
        </footer>
      </section>
    );

    return (
      <div ref={ref} className="eoidoc">
        <style>{css}</style>
        {page(
          1,
          <>
            <header className="eoidoc-head">
              <div className="eoidoc-title">
                <h1>استمارة إبداء الرغبة في حجز وحدة سكنية</h1>
                <p>EXPRESSION OF INTEREST · UNIT RESERVATION</p>
                {projectLine && (
                  <div className="eoidoc-project">{projectLine}</div>
                )}
              </div>
              <img src={logo} alt="Amwaj International" />
            </header>
            {demo ? (
              <div className="eoidoc-ribbon demo">
                <span>
                  عرض تجريبي — بيانات افتراضية، ليست مستنداً لعميل حقيقي
                </span>
                <span dir="ltr">
                  Demo / Sample — simulated data, not a customer document
                </span>
              </div>
            ) : (
              <div className="eoidoc-ribbon draft">
                <span>مسودة للمراجعة — الإقرار والشروط المعتمدة غير مرفقة</span>
                <span dir="ltr">
                  Draft for review — approved declaration and terms not attached
                </span>
              </div>
            )}
            <div className="eoidoc-meta">
              <Meta
                ar="رقم الاستمارة"
                en="EOI number"
                value={<Ltr>{eoi.name}</Ltr>}
              />
              <Meta
                ar="تاريخ الإنشاء"
                en="Created"
                value={
                  eoi.createdDate ? <Ltr>{dmy(eoi.createdDate)}</Ltr> : null
                }
              />
              <Meta
                ar="الحالة"
                en="Status"
                value={
                  eoi.status
                    ? `${statusAr ?? ''}${statusAr ? ' · ' : ''}${eoi.statusLabel ?? eoi.status}`
                    : null
                }
              />
              <Meta
                ar="انتهاء حجز الوحدة"
                en="Hold expires"
                value={eoi.expiryDate ? <Ltr>{dmy(eoi.expiryDate)}</Ltr> : null}
              />
            </div>

            <Sec ar="بيانات المشتري" en="Buyer">
              <div className="eoidoc-grid">
                <Row
                  ar="الاسم الرباعي"
                  en="Full name (Arabic)"
                  wide
                  value={c?.fullNameArabic}
                />
                <Row
                  ar="الاسم بالإنكليزية"
                  en="Name (English)"
                  wide
                  value={c?.name ? <Ltr>{c.name}</Ltr> : null}
                />
              </div>
              <div className="eoidoc-grid c2" style={{ marginTop: 6 }}>
                <Row
                  ar="رقم البطاقة الوطنية"
                  en="National ID"
                  value={c?.nationalId ? <Ltr>{c.nationalId}</Ltr> : null}
                />
                <Row
                  ar="تاريخ الإصدار"
                  en="Issue date"
                  value={
                    c?.nationalIdDate ? (
                      <Ltr>{dmy(c.nationalIdDate)}</Ltr>
                    ) : null
                  }
                />
                <Row
                  ar="رقم بطاقة السكن"
                  en="Residence ID"
                  value={c?.residenceId ? <Ltr>{c.residenceId}</Ltr> : null}
                />
                <Row
                  ar="تاريخ الإصدار"
                  en="Issue date"
                  value={
                    c?.residenceIdDate ? (
                      <Ltr>{dmy(c.residenceIdDate)}</Ltr>
                    ) : null
                  }
                />
              </div>
            </Sec>

            <Sec ar="العنوان" en="Address">
              <div className="eoidoc-grid c3">
                <Row
                  ar="المحافظة"
                  en="Governorate"
                  value={
                    c?.governorate
                      ? `${AR.governorate[c.governorate] ?? c.governorate}`
                      : null
                  }
                />
                <Row ar="القضاء / المنطقة" en="District" value={c?.district} />
                <Row
                  ar="المحلة"
                  en="Locality"
                  value={c?.neighborhood ? <Ltr>{c.neighborhood}</Ltr> : null}
                />
                <Row
                  ar="الزقاق"
                  en="Alley"
                  value={c?.alley ? <Ltr>{c.alley}</Ltr> : null}
                />
                <Row
                  ar="الدار"
                  en="House no."
                  value={c?.houseNumber ? <Ltr>{c.houseNumber}</Ltr> : null}
                />
              </div>
            </Sec>

            <Sec ar="التواصل" en="Contact">
              <div className="eoidoc-grid c2">
                <Row
                  ar="رقم الهاتف ١"
                  en="Phone 1"
                  value={c?.mobile ? <Ltr>{c.mobile}</Ltr> : null}
                />
                <Row
                  ar="رقم الهاتف ٢"
                  en="Phone 2"
                  value={c?.phone2 ? <Ltr>{c.phone2}</Ltr> : null}
                />
              </div>
              <div className="eoidoc-grid" style={{ marginTop: 6 }}>
                <Row
                  ar="البريد الإلكتروني"
                  en="Email"
                  wide
                  value={c?.email ? <Ltr>{c.email}</Ltr> : null}
                />
              </div>
            </Sec>

            <Sec ar="تفاصيل الوحدة" en="Unit">
              <div className="eoidoc-grid c2">
                <Row ar="المشروع" en="Project" value={projectLine || null} />
                <Row
                  ar="العمارة / المبنى"
                  en="Building"
                  value={building || null}
                />
                <Row
                  ar="رقم الوحدة"
                  en="Unit number"
                  value={
                    eoi.unitName ? (
                      <Ltr>
                        {[eoi.unitName, eoi.unitCode]
                          .filter(Boolean)
                          .join(' · ')}
                      </Ltr>
                    ) : null
                  }
                />
                <Row
                  ar="الطابق"
                  en="Floor"
                  value={
                    eoi.floor != null ? <Ltr>{floorText(eoi.floor)}</Ltr> : null
                  }
                />
                <Row
                  ar="النموذج / النوع"
                  en="Type"
                  value={
                    eoi.unitTypeLabel ? (
                      <Ltr>
                        {[
                          eoi.unitTypeLabel,
                          eoi.bedrooms ? `${eoi.bedrooms} BR` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Ltr>
                    ) : null
                  }
                />
                <Row
                  ar="المساحة"
                  en="Area"
                  value={
                    eoi.area != null ? <Ltr>{`${fmt(eoi.area)} m²`}</Ltr> : null
                  }
                />
              </div>
            </Sec>
          </>
        )}
        {page(
          2,
          <>
            <Sec ar="السعر" en="Price" first>
              <div className="eoidoc-grid">
                <Row
                  ar="السعر الأساسي"
                  en="List price"
                  wide
                  value={
                    amt(price.listPrice) ? (
                      <Ltr>{amt(price.listPrice)}</Ltr>
                    ) : null
                  }
                />
                <Row
                  ar="الخصم"
                  en="Discount"
                  wide
                  value={
                    price.discount.kind === 'none' ? (
                      'لا يوجد · None'
                    ) : (
                      <DiscountText
                        state={price.discount}
                        amount={
                          price.discount.kind === 'approved'
                            ? amt(price.discount.amount)
                            : null
                        }
                      />
                    )
                  }
                />
                <Row
                  ar="السعر الصافي"
                  en="Net price"
                  wide
                  strong
                  value={
                    amt(price.netPrice) ? (
                      <Ltr>{amt(price.netPrice)}</Ltr>
                    ) : null
                  }
                />
                <Row
                  ar="مبلغ الحجز"
                  en="Booking fee"
                  wide
                  value={
                    amt(price.bookingFee) ? (
                      <>
                        <span>
                          <Ltr>{amt(price.bookingFee)}</Ltr>
                        </span>
                        <span className="eoidoc-note">
                          يُدفع إضافةً إلى سعر الوحدة —{' '}
                          {eoi.paymentVerified
                            ? 'تم تأكيده من المالية'
                            : 'لم يُؤكَّد من المالية بعد'}
                        </span>
                        <span className="eoidoc-note" dir="ltr">
                          Paid in addition to the unit price —{' '}
                          {eoi.paymentVerified
                            ? 'confirmed by finance'
                            : 'not yet confirmed by finance'}
                        </span>
                      </>
                    ) : null
                  }
                />
              </div>
            </Sec>

            <Sec ar="الدفع" en="Payment">
              <div className="eoidoc-grid c2">
                <Row
                  ar="طريقة الدفع"
                  en="Payment method"
                  value={
                    eoi.paymentMethod
                      ? `${methodAr ?? ''}${methodAr ? ' · ' : ''}${eoi.paymentMethodLabel ?? eoi.paymentMethod}`
                      : null
                  }
                />
                <Row
                  ar="خطة الدفع"
                  en="Payment plan"
                  value={
                    eoi.paymentPlanName ? (
                      <Ltr>{eoi.paymentPlanName}</Ltr>
                    ) : null
                  }
                />
              </div>
            </Sec>

            <Sec ar="الإقرار والشروط" en="Declaration and terms">
              <div className="eoidoc-terms">
                <p>
                  <b>مسودة:</b> لا يتضمن هذا المستند الإقرار أو شروط الاسترداد
                  أو تعليمات الحساب المصرفي، لعدم توفر نص معتمد لها في النظام.
                  يُرفق النص المعتمد من أمواج للمشروع قبل التوقيع.
                </p>
                <p className="en">
                  <b>Draft:</b> this document does not include a declaration,
                  refund conditions or bank account instructions, because no
                  approved wording is recorded for them. Attach Amwaj's approved
                  wording for this project before signing.
                </p>
              </div>
            </Sec>

            <Sec ar="التواقيع" en="Signatures">
              <div className="eoidoc-grid c3">
                <Sign
                  ar="المشتري"
                  en="Buyer"
                  name={c?.fullNameArabic ?? c?.name}
                />
                <Sign
                  ar="موظف المبيعات"
                  en="Sales representative"
                  name={eoi.ownerName ?? eoi.createdByName}
                />
                <Sign
                  ar="مدير المبيعات"
                  en="Sales manager"
                  name={data.salesManagerName ?? undefined}
                />
              </div>
            </Sec>
          </>
        )}
      </div>
    );
  }
);

const DISCOUNT_TEXT = {
  approved: ['خصم معتمد', 'Approved discount'],
  pending: ['خصم مطلوب، بانتظار الموافقة', 'Requested, awaiting approval'],
  rejected: ['خصم مطلوب، مرفوض', 'Requested, rejected'],
  onReservation: ['يُعتمد في مرحلة الحجز', 'Approved on the reservation'],
} as const;

function DiscountText({
  state,
  amount,
}: {
  state: Exclude<ReturnType<typeof eoiPricing>['discount'], { kind: 'none' }>;
  amount: string | null;
}) {
  const [ar, en] = DISCOUNT_TEXT[state.kind];
  return (
    <>
      <span>
        <Ltr>{`${state.pct}%${amount ? ` (−${amount})` : ''}`}</Ltr> — {ar}
      </span>
      <span className="eoidoc-note" dir="ltr">
        {en}
      </span>
      {state.kind !== 'approved' && (
        <>
          <span className="eoidoc-note">
            غير محتسب في السعر الصافي وليس التزاماً تجارياً
          </span>
          <span className="eoidoc-note" dir="ltr">
            Not deducted from the net price and not a commercial commitment
          </span>
        </>
      )}
    </>
  );
}

function Ltr({ children }: { children: ReactNode }) {
  return <span className="eoidoc-ltr">{children}</span>;
}

function Meta({ ar, en, value }: { ar: string; en: string; value: ReactNode }) {
  return (
    <div>
      <div className="eoidoc-k">
        <b>{ar}</b> <span className="eoidoc-en">{en}</span>
      </div>
      <div className="eoidoc-v">
        {value ?? <span className="eoidoc-none">—</span>}
      </div>
    </div>
  );
}

function Sec({
  ar,
  en,
  first,
  children,
}: {
  ar: string;
  en: string;
  first?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className="eoidoc-sec"
      style={first ? { marginTop: 4 } : undefined}
    >
      <h2>
        {ar} <small>{en}</small>
      </h2>
      {children}
    </section>
  );
}

function Row({
  ar,
  en,
  value,
  wide,
  strong,
}: {
  ar: string;
  en: string;
  value: ReactNode;
  wide?: boolean;
  strong?: boolean;
}) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div
      className={`eoidoc-row${wide ? ' wide' : ''}${strong ? ' strong' : ''}`}
    >
      <div className="l">
        <span>{ar}</span>
        <em dir="ltr">{en}</em>
      </div>
      <div className="val">
        {empty ? <span className="eoidoc-none">—</span> : value}
      </div>
    </div>
  );
}

function Sign({ ar, en, name }: { ar: string; en: string; name?: string }) {
  return (
    <div className="eoidoc-sign">
      <h3>
        {ar}
        <small>{en}</small>
      </h3>
      <div className="eoidoc-line">
        <span>الاسم · Name</span>
        <span className="fill">{name}</span>
      </div>
      <div className="eoidoc-line sig">
        <span>التوقيع · Signature</span>
        <span className="fill" />
      </div>
      <div className="eoidoc-line">
        <span>التاريخ · Date</span>
        <span className="fill" />
      </div>
    </div>
  );
}

/** dd/mm/yyyy in Latin digits; date-only values are calendar days (never shifted). */
function dmy(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  if (value.length > 10) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      const p = new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(d);
      return p;
    }
  }
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
}

function floorText(floor: number): string {
  return floor === 0 ? 'Ground (0)' : String(floor);
}
