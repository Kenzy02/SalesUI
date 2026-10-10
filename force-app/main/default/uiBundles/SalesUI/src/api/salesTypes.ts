/**
 * Response shapes of the AmwajSalesApi Apex REST service
 * (/services/apexrest/amwaj/sales/v1). Fields the user cannot read in
 * Salesforce are omitted by the server, so most properties are optional.
 */

export interface Option {
  value: string;
  label: string;
}

export interface Me {
  userId: string;
  name: string;
  firstName?: string;
  currencyCode: string;
  /** Salesforce user time zone, e.g. Asia/Baghdad. */
  timeZone?: string;
  locale?: string;
  today: string;
  eoiPeriodDays?: number;
  reservationHoldDays?: number;
  canCreateEoi: boolean;
  canCreateReservation: boolean;
  canEditEoi: boolean;
  activitiesEnabled: boolean;
}

export interface FollowUp {
  subject?: string;
  dueDate?: string;
}

export interface LeadRow {
  id: string;
  name?: string;
  status?: string;
  source?: string;
  channel?: string;
  rating?: string;
  mobile?: string;
  email?: string;
  city?: string;
  projectInterestId?: string;
  projectInterest?: string;
  secondProjectInterestId?: string;
  interestedUnitId?: string;
  interestedUnit?: string;
  /** Unit type of the recorded interested unit (the only unit-type preference the org records). */
  interestedUnitType?: string;
  desiredArea?: number;
  createdDate?: string;
  lastActivityDate?: string;
  nextFollowUp?: FollowUp;
}

export interface Activity {
  id: string;
  subject?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  comments?: string;
  isClosed?: boolean;
  kind?: string;
  completedAt?: string;
  createdDate?: string;
  ownerName?: string;
}

export interface LeadDetail extends LeadRow {
  firstName?: string;
  lastName?: string;
  phone?: string;
  description?: string;
  profession?: string;
  nationality?: string;
  organization?: string;
  salesDepartment?: string;
  secondProjectInterest?: string;
  buyerName?: string;
  brokerName?: string;
  ownerName?: string;
  isConverted?: boolean;
  convertedAccountId?: string;
  convertedDealId?: string;
  isMine: boolean;
  canEdit: boolean;
  canEditStatus: boolean;
  canEditRating: boolean;
  canEditDescription: boolean;
  statusOptions: Option[];
  ratingOptions: Option[];
  activities: Activity[];
}

export interface DealRow {
  id: string;
  name?: string;
  stage?: string;
  isClosed?: boolean;
  amount?: number;
  closeDate?: string;
  lastActivityDate?: string;
  eoiCreated?: boolean;
  reservationCreated?: boolean;
  accountId?: string;
  customerName?: string;
  mobile?: string;
  email?: string;
  projectId?: string;
  projectName?: string;
  interestedUnitId?: string;
  interestedUnitName?: string;
  interestedUnitType?: string;
  ownerName?: string;
}

export interface CustomerDetails {
  name?: string;
  isPersonAccount?: boolean;
  fullNameArabic?: string;
  mobile?: string;
  email?: string;
  nationalId?: string;
  nationalIdDate?: string;
  residenceId?: string;
  residenceIdDate?: string;
  city?: string;
  district?: string;
  neighborhood?: string;
  alley?: string;
  houseNumber?: string;
  cityOptions: Option[];
}

export interface ReservationRow {
  id: string;
  name?: string;
  status?: string;
  holdExpiry?: string;
  deposit?: number;
  depositVerified?: boolean;
  netPrice?: number;
  unitName?: string;
  eoiName?: string;
}

/** One reservation in the user's list (`GET reservations`); absent fields are not recorded or not readable. */
export interface ReservationListRow {
  id: string;
  name?: string;
  status?: string;
  holdExpiry?: string;
  listPrice?: number;
  discountPct?: number;
  netPrice?: number;
  deposit?: number;
  depositVerified?: boolean;
  depositVerifiedDate?: string;
  saleDate?: string;
  cancelledDate?: string;
  paymentPlanName?: string;
  eoiId?: string;
  eoiName?: string;
  dealId?: string;
  dealName?: string;
  accountId?: string;
  customerName?: string;
  unitId?: string;
  unitName?: string;
  projectName?: string;
  createdDate?: string;
}

export interface FileRef {
  versionId: string;
  title?: string;
  fileType?: string;
  size?: number;
  createdDate?: string;
  isImage: boolean;
  kind: 'image' | 'floorplan' | 'document';
  source?: 'unit' | 'building' | 'project';
}

export type EoiNextStep =
  | 'AWAITING_DISCOUNT_APPROVAL'
  | 'DISCOUNT_REJECTED'
  | 'ATTACH_SIGNED_EOI'
  | 'AWAITING_FINANCE'
  | 'CREATE_RESERVATION'
  | 'RESERVED'
  | 'CLOSED';

export interface EoiRow {
  id: string;
  name?: string;
  status?: string;
  approvalStatus?: string;
  discountPct?: number;
  documentAttached?: boolean;
  expiryDate?: string;
  isDue?: boolean;
  paymentVerified?: boolean;
  paymentVerifiedDate?: string;
  reservationFee?: number;
  netUnitPrice?: number;
  paymentMethod?: string;
  customerName?: string;
  unitId?: string;
  unitName?: string;
  unitStatus?: string;
  projectName?: string;
  paymentPlanId?: string;
  paymentPlanName?: string;
  dealId?: string;
  dealName?: string;
  dealHasReservation?: boolean;
  refundedAmount?: number;
  notes?: string;
  createdDate?: string;
  ownerName?: string;
  reservations: ReservationRow[];
  documents: FileRef[];
  nextStep?: EoiNextStep;
  canEdit?: boolean;
}

export interface DealDetail extends DealRow {
  isMine: boolean;
  canEdit: boolean;
  customer?: CustomerDetails;
  eois: EoiRow[];
  reservations: ReservationRow[];
  activities: Activity[];
}

export interface ProjectFacet {
  id: string;
  name?: string;
  status?: string;
  salesDepartment?: string;
  availableUnits?: number;
  totalUnits?: number;
  /** At least one active, effective payment plan exists for the project. */
  hasPaymentPlans?: boolean;
}

export interface ProjectUnitType {
  projectId: string;
  unitType: string;
  available: number;
  total: number;
}

export interface UnitFacets {
  projects: ProjectFacet[];
  zones: { projectId: string; zone: string }[];
  typesByProject: ProjectUnitType[];
  unitTypes: Option[];
  statuses: Option[];
}

export interface UnitRow {
  id: string;
  name?: string;
  unitCode?: string;
  status?: string;
  unitType?: string;
  bedrooms?: number;
  bathrooms?: number;
  builtUpArea?: number;
  gardenArea?: number;
  terraceArea?: number;
  plotArea?: number;
  floor?: number;
  zone?: string;
  view?: string;
  finishing?: string;
  listPrice?: number;
  hasGarden?: boolean;
  hasParking?: boolean;
  hasStorage?: boolean;
  isCorner?: boolean;
  isPenthouse?: boolean;
  underConstruction?: boolean;
  street?: string;
  plotNumber?: string;
  otherDetails?: string;
  projectId?: string;
  projectName?: string;
  projectStatus?: string;
  buildingId?: string;
  buildingName?: string;
  coverImage?: FileRef;
}

export interface UnitPage {
  units: UnitRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** PaymentPlanViewerController DTOs (org's existing pricing and eligibility logic). */
export interface PlanRow {
  seq?: number;
  installmentType?: string;
  label?: string;
  dueTrigger?: string;
  pct?: number;
  amount?: number;
  isPostHandover?: boolean;
}

export interface Plan {
  id: string;
  name?: string;
  planCode?: string;
  description?: string;
  specificity?: string;
  specificityDetail?: string;
  durationYears?: number;
  installmentFrequency?: string;
  effectivePrice?: number;
  totalPercentage?: number;
  totalsWarning?: boolean;
  hasLaunchCheck?: boolean;
  isMisconfigured?: boolean;
  misconfiguredReason?: string;
  installmentCount?: number;
  rows?: PlanRow[];
  preHandoverPct?: number;
  preHandoverAmount?: number;
  postHandoverPct?: number;
  postHandoverAmount?: number;
  totalAmount?: number;
}

export interface Pricing {
  price?: { priceListItemId?: string; listPrice?: number; hasMultipleActiveItems?: boolean };
  plans?: Plan[];
  generatedOn?: string;
}

export interface UnitDetail extends UnitRow {
  media: FileRef[];
  pricing: Pricing;
  /** Booking (reservation) fee the org's EOI process charges for this unit's list price. */
  bookingFee?: number;
  myHold?: { id: string; name?: string; status?: string; expiryDate?: string };
}

export interface Hold {
  eoiId: string;
  name?: string;
  holdType: 'EOI' | 'RESERVATION';
  customerName?: string;
  unitName?: string;
  projectName?: string;
  holdExpiry?: string;
  isOverdue: boolean;
  expiresSoon: boolean;
}

export interface OverviewFollowUp {
  id: string;
  subject?: string;
  dueDate?: string;
  leadId?: string;
  leadName?: string;
  relatedId?: string;
  relatedName?: string;
}

export interface CommissionSummary {
  ratePct?: number;
  rateStatus?: 'PROPOSED_UNCONFIRMED';
  currencyCode: string;
  commission: number;
  soldCommission?: number;
  soldUnits?: number;
  eligibleBasis: number;
  awaitingSignatureBasis: number;
  paidTracked: boolean;
}

/** Each panel loads independently; a failed panel is reported in sectionErrors and its data is absent. */
export interface Overview {
  openLeads?: number;
  leadsByStatus?: Record<string, number>;
  followUps?: OverviewFollowUp[];
  holds?: Hold[];
  eoisAwaitingAction?: EoiRow[];
  commission?: CommissionSummary;
  sectionErrors: Partial<Record<'leads' | 'followUps' | 'eois' | 'commission', string>>;
}

export type CommissionState = 'ELIGIBLE' | 'AWAITING_SIGNATURE' | 'NO_CONFIRMED_COLLECTIONS';

export interface CommissionLine {
  eoiId: string;
  eoiName?: string;
  eoiStatus?: string;
  dealId?: string;
  dealName?: string;
  customerId?: string;
  customerName?: string;
  unitId?: string;
  unitName?: string;
  projectId?: string;
  projectName?: string;
  signed: boolean;
  saleStatus: SaleStatus;
  reservationId?: string;
  reservationName?: string;
  reservationStatus?: string;
  /** Reservation activation date; absent when not recorded. */
  saleDate?: string;
  /** Reservation net price, read in the user's own access. */
  saleValue?: number;
  /** False when the reservation (or its price) is not shared with the user. */
  saleDetailsVisible: boolean;
  /** Confirmed deposits on cancelled reservations not counted, because a later reservation on the same EOI has its own. */
  excludedDeposits: number;
  propertyPayments: number;
  bookingFees: number;
  tax: number;
  refunds: number;
  unconfirmedBookingFees: number;
  unconfirmedPropertyPayments: number;
  netCollected: number;
  eligibleBasis: number;
  commission: number;
  state: CommissionState;
}

export interface Commission {
  ratePct?: number;
  /** No approval of the rate is recorded in Salesforce. */
  rateStatus: 'PROPOSED_UNCONFIRMED';
  currencyCode: string;
  taxRecorded: boolean;
  paidTracked: boolean;
  paid?: number;
  propertyPayments: number;
  bookingFees: number;
  tax: number;
  refunds: number;
  eligibleBasis: number;
  awaitingSignatureBasis: number;
  commission: number;
  soldUnits: number;
  soldEligibleBasis: number;
  soldCommission: number;
  notSoldEligibleBasis: number;
  notSoldCommission: number;
  propertyCommission: number;
  bookingFeeCommission: number;
  taxCommission: number;
  refundCommission: number;
  lines: CommissionLine[];
}

export interface CustomerInput {
  fullNameArabic: string;
  mobile: string;
  nationalId: string;
  nationalIdDate: string;
  residenceId?: string;
  residenceIdDate?: string;
  city: string;
  district: string;
  neighborhood: string;
  alley: string;
  houseNumber: string;
}

export interface OfferInput {
  dealId: string;
  unitId: string;
  paymentPlanId: string;
  discountPct: number;
  paymentMethod: string;
  notes?: string;
  customer: CustomerInput;
  /** The list price the rep reviewed; Salesforce refuses the request if the price has changed. */
  expectedListPrice?: number;
}

export interface EoiCreated {
  eoiId: string;
  name?: string;
  status?: string;
  approvalStatus?: string;
  expiryDate?: string;
  discountPct?: number;
  reservationFee?: number;
  netUnitPrice?: number;
  paymentMethod?: string;
  unitId?: string;
  unitName?: string;
  unitStatus?: string;
  projectName?: string;
  paymentPlanId?: string;
  paymentPlanName?: string;
  customerId?: string;
  customerName?: string;
  dealId?: string;
  dealName?: string;
  /** Lightning record page of the EOI in Salesforce. */
  recordUrl?: string;
  nextStep?: EoiNextStep;
  replayed: boolean;
}

/** An existing customer found by the org's duplicate check (mobile, phone or national ID). */
export interface CustomerMatch {
  id: string;
  name?: string;
  mobile?: string;
  ownerName?: string;
  nationalIdEnding?: string;
  matchedOn: ('mobile' | 'phone' | 'national ID')[];
  /** The lead is linked to this buyer (Lead.Buyer__c); the org requires converting into it. */
  isLinkedBuyer: boolean;
  /** Mobile and national ID are unique per customer, so a new customer with them would be refused. */
  blocksNewCustomer: boolean;
  canUse: boolean;
  openDeals: { id: string; name?: string; stage?: string; projectName?: string; ownerName?: string; hasEoi?: boolean; canUse: boolean }[];
}

/** Result of converting a lead, or of resolving a lead that was already converted. */
export interface ConversionResult {
  leadId: string;
  converted: true;
  replayed: boolean;
  accountId?: string;
  customerName?: string;
  dealId?: string;
  dealName?: string;
  dealProject?: string;
  dealIsClosed?: boolean;
  dealHasEoi?: boolean;
  /** The deal is open, has no EOI and the user can edit it. */
  canContinue?: boolean;
  createdCustomer?: boolean;
  createdDeal?: boolean;
}

export interface ConversionReview {
  leadId: string;
  converted: false;
  firstName?: string;
  lastName?: string;
  mobile?: string;
  email?: string;
  nationalId?: string;
  company?: string;
  projectInterest?: string;
  interestedUnit?: string;
  linkedBuyerId?: string;
  convertedStatus: string;
  blockers: string[];
  canConvert: boolean;
  canEditNationalId: boolean;
  matches: CustomerMatch[];
  duplicateLeads: { id: string; name?: string; status?: string; ownerName?: string }[];
}

export interface ConvertInput {
  firstName?: string;
  lastName: string;
  mobile: string;
  email?: string;
  nationalId?: string;
  accountId?: string;
  dealId?: string;
}

export interface ReservationInput {
  eoiId: string;
  paymentPlanId?: string;
  depositAmount?: number;
  notes?: string;
}

export interface ReservationCreated {
  reservationId: string;
  name?: string;
  status?: string;
  holdExpiry?: string;
  listPrice?: number;
  netPrice?: number;
  deposit?: number;
  unitName?: string;
  unitStatus?: string;
  replayed: boolean;
}

/** Where a unit stands for its customer (AmwajPaymentLedger). */
export type SaleStatus = 'SOLD' | 'RESERVED' | 'EOI_HOLD' | 'CLOSED';

export type PaymentFlag = 'POSSIBLE_CARRIED_DEPOSIT' | 'EXPIRED_FEE_NOT_REFUNDED';

/** Customer-level payment figures. A null amount means not available to this user (field access), never zero. */
export interface PortfolioPayments {
  confirmedPaid: number | null;
  confirmedBookingFees: number | null;
  confirmedDeposits: number | null;
  refunds: number | null;
  pendingConfirmation: number | null;
  excludedDeposits: number | null;
  /** Net price of sold and reserved units; null when none, or a price isn't visible. */
  propertyPrice?: number | null;
  confirmedTowardPrice?: number | null;
  /**
   * Live: the org records no instalment schedule, receipts or due dates, so these are absent
   * and installmentsRecorded is false. Demo mode fills them from its sample schedules.
   */
  remainingPayable?: number | null;
  overdue?: number | null;
  nextPayment?: NextPayment | null;
  installmentsRecorded: boolean;
  installments?: InstallmentCounts;
}

export interface NextPayment {
  dueDate: string;
  amount: number;
  label: string;
}

/** Mutually exclusive: paid in full, part paid, past due with nothing paid, not yet due. */
export interface InstallmentCounts {
  paid: number;
  partial: number;
  overdue: number;
  upcoming: number;
}

export type InstallmentStatus = 'PAID' | 'PARTIAL' | 'OVERDUE' | 'UPCOMING';

/** One line of a payment schedule (demo mode only; Salesforce records none). */
export interface ScheduleLine {
  key: string;
  label: string;
  dueDate: string;
  amount: number;
  paid: number;
  paidDate?: string;
  status: InstallmentStatus;
}

export interface PortfolioUnit {
  key: string;
  unitId?: string;
  unitName?: string;
  projectName?: string;
  saleStatus: SaleStatus;
  eoiStatus?: string;
  reservationStatus?: string;
  netConfirmed: number;
  price?: number;
}

export interface CustomerCounts {
  sold: number;
  reserved: number;
  eoiHold: number;
  closed: number;
  deals: number;
  myDeals: number;
}

export interface CustomerCard {
  id: string;
  name?: string;
  mobile?: string;
  phone?: string;
  email?: string;
  counts: CustomerCounts;
  units: PortfolioUnit[];
  payments: PortfolioPayments;
  flags: PaymentFlag[];
  /** A deal says an EOI or reservation exists that isn't shared with the user. */
  hiddenRecords: boolean;
  lastActivity?: string;
}

export interface CustomerList {
  customers: CustomerCard[];
  totals: {
    customers: number;
    sold: number;
    reserved: number;
    eoiHold: number;
    confirmedPaid: number | null;
    pendingConfirmation: number | null;
    /** Demo mode only. */
    remainingPayable?: number | null;
    overdue?: number | null;
  };
  truncated: boolean;
  paymentsReadable: boolean;
}

/** AmwajPaymentLedger.UnitMoney */
export interface UnitMoney {
  bookingFee?: number;
  bookingFeeConfirmed: boolean;
  bookingFeeConfirmedDate?: string;
  confirmedBookingFee: number;
  pendingBookingFee: number;
  confirmedDeposits: number;
  confirmedTowardPrice: number;
  pendingDeposits: number;
  excludedDeposits: number;
  refunds: number;
  refundSource?: 'REFUND_REQUEST' | 'EOI';
  netConfirmed: number;
  price?: number;
  flags: PaymentFlag[];
}

export interface PortfolioDeal {
  id: string;
  name?: string;
  stage?: string;
  isClosed?: boolean;
  projectName?: string;
  ownerName?: string;
  isMine: boolean;
}

export interface PortfolioEoi {
  id: string;
  name?: string;
  status?: string;
  approvalStatus?: string;
  bookingFee?: number;
  paymentVerified?: boolean;
  paymentVerifiedDate?: string;
  documentAttached?: boolean;
  expiryDate?: string;
  offerPrice?: number;
  discountPct?: number;
  paymentMethod?: string;
  paymentPlanName?: string;
  refundedAmount?: number;
  refundedDate?: string;
}

export interface PortfolioReservation {
  id: string;
  name?: string;
  status?: string;
  holdExpiry?: string;
  listPrice?: number;
  discountPct?: number;
  netPrice?: number;
  deposit?: number;
  depositVerified?: boolean;
  depositVerifiedDate?: string;
  saleDate?: string;
  cancelledDate?: string;
  paymentPlanName?: string;
}

export interface PortfolioRefund {
  id: string;
  name?: string;
  status?: string;
  approvedAmount?: number;
  requestedAmount?: number;
  processedDate?: string;
}

export interface PortfolioUnitDetail extends PortfolioUnit {
  dealId?: string;
  deal?: PortfolioDeal;
  eoi?: PortfolioEoi;
  reservations: PortfolioReservation[];
  refunds: PortfolioRefund[];
  saleDate?: string;
  paymentPlanName?: string;
  /** Null when the user can't read the payment fields. */
  money?: UnitMoney | null;
  /** Demo mode only: the sample payment schedule for a sold or reserved unit. */
  schedule?: ScheduleLine[];
}

export interface CustomerPortfolio extends Omit<CustomerCard, 'units'> {
  units: PortfolioUnitDetail[];
  deals: PortfolioDeal[];
  paymentsReadable: boolean;
  truncated: boolean;
}
