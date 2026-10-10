/**
 * The EOI document: what it shows and how prices are stated. Values come from
 * the saved EOI and its linked records (`GET eois/{id}/document-data`), never
 * from form input. A requested discount is never shown as an approved price.
 */

export interface EoiDocumentEoi {
  id: string;
  name?: string;
  status?: string;
  statusLabel?: string;
  createdDate?: string;
  expiryDate?: string;
  /** Whole percent as stored on the EOI (2 = 2%). */
  discountPct?: number;
  approvalStatus?: string;
  /** Skip_Discount_Approval__c: the discount is approved on the reservation, not on this EOI. */
  discountOnReservation?: boolean;
  bookingFee?: number;
  paymentVerified?: boolean;
  signedDocumentOnFile?: boolean;
  paymentMethod?: string;
  paymentMethodLabel?: string;
  paymentPlanName?: string;
  dealName?: string;
  ownerName?: string;
  createdByName?: string;
  unitName?: string;
  unitCode?: string;
  unitType?: string;
  unitTypeLabel?: string;
  floor?: number;
  area?: number;
  bedrooms?: number;
  listPrice?: number;
  buildingName?: string;
  buildingNameAr?: string;
  projectName?: string;
  projectNameAr?: string;
  projectCode?: string;
}

export interface EoiDocumentCustomer {
  id: string;
  name?: string;
  fullNameArabic?: string;
  nationalId?: string;
  nationalIdDate?: string;
  residenceId?: string;
  residenceIdDate?: string;
  /** BillingCity holds the governorate in this org (picklist of the 18 governorates). */
  governorate?: string;
  district?: string;
  neighborhood?: string;
  alley?: string;
  houseNumber?: string;
  mobile?: string;
  phone2?: string;
  email?: string;
}

export interface EoiDocumentData {
  eoi: EoiDocumentEoi;
  customer?: EoiDocumentCustomer | null;
  salesManagerName?: string | null;
  /** The user may add files to this EOI (same rule as filing the signed EOI). */
  canSave: boolean;
}

export type DiscountState =
  | { kind: 'none' }
  | { kind: 'approved'; pct: number; amount: number }
  | { kind: 'pending'; pct: number }
  | { kind: 'rejected'; pct: number }
  | { kind: 'onReservation'; pct: number };

export interface EoiPricing {
  listPrice?: number;
  discount: DiscountState;
  /** List price less an approved discount only. */
  netPrice?: number;
  bookingFee?: number;
}

/** Prices as committed: a discount reduces the price only once it is approved on this EOI. */
export function eoiPricing(eoi: EoiDocumentEoi): EoiPricing {
  const list = eoi.listPrice;
  const pct = eoi.discountPct ?? 0;
  let discount: DiscountState = { kind: 'none' };
  if (pct > 0) {
    if (eoi.discountOnReservation) discount = { kind: 'onReservation', pct };
    else if (eoi.approvalStatus === 'Approved')
      discount = {
        kind: 'approved',
        pct,
        amount: list != null ? round2((list * pct) / 100) : 0,
      };
    else if (eoi.approvalStatus === 'Rejected')
      discount = { kind: 'rejected', pct };
    else discount = { kind: 'pending', pct };
  }
  const netPrice =
    list == null
      ? undefined
      : discount.kind === 'approved'
        ? round2(list - discount.amount)
        : list;
  return { listPrice: list, discount, netPrice, bookingFee: eoi.bookingFee };
}

/** Files saved from "Generate EOI PDF" carry this suffix (AmwajEoiDocumentService.GENERATED_SUFFIX). */
export const GENERATED_SUFFIX = ' (generated, unsigned)';

export function isGeneratedEoiFile(title: string | undefined): boolean {
  return !!title && title.endsWith(GENERATED_SUFFIX);
}

export function eoiFileName(eoiName: string | undefined, demo = false): string {
  const safe = (eoiName ?? 'EOI')
    .replace(/^EOI-/i, '')
    .replace(/[^A-Za-z0-9-]+/g, '-');
  return `Amwaj-EOI-${safe}${demo ? '-DEMO' : ''}.pdf`;
}

/** Arabic labels for the org's picklist values; anything else is shown as recorded. */
export const AR = {
  status: {
    Submitted: 'مقدَّمة',
    Paid: 'مدفوعة',
    Expired: 'منتهية',
    Refunded: 'مستردة',
  } as Record<string, string>,
  paymentMethod: { Cash: 'نقداً', Installments: 'تقسيط' } as Record<
    string,
    string
  >,
  governorate: {
    Baghdad: 'بغداد',
    Basra: 'البصرة',
    Nineveh: 'نينوى',
    Erbil: 'أربيل',
    Sulaymaniyah: 'السليمانية',
    Duhok: 'دهوك',
    Kirkuk: 'كركوك',
    Diyala: 'ديالى',
    Anbar: 'الأنبار',
    Babil: 'بابل',
    Karbala: 'كربلاء',
    Wasit: 'واسط',
    Salahuddin: 'صلاح الدين',
    Najaf: 'النجف',
    Diwaniyah: 'الديوانية',
    Maysan: 'ميسان',
    DhiQar: 'ذي قار',
    Muthanna: 'المثنى',
  } as Record<string, string>,
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
