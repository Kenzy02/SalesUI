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
  projectInterest?: string;
  interestedUnit?: string;
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
  interestedUnitId?: string;
  buyerName?: string;
  brokerName?: string;
  ownerName?: string;
  isConverted?: boolean;
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
}

export interface UnitFacets {
  projects: ProjectFacet[];
  zones: { projectId: string; zone: string }[];
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
  currencyCode: string;
  commission: number;
  eligibleBasis: number;
  awaitingSignatureBasis: number;
  paidTracked: boolean;
}

export interface Overview {
  openLeads: number;
  leadsByStatus: Record<string, number>;
  followUps: OverviewFollowUp[];
  holds: Hold[];
  eoisAwaitingAction: EoiRow[];
  commission: CommissionSummary;
}

export type CommissionState = 'ELIGIBLE' | 'AWAITING_SIGNATURE' | 'NO_CONFIRMED_COLLECTIONS';

export interface CommissionLine {
  eoiId: string;
  eoiName?: string;
  eoiStatus?: string;
  dealId?: string;
  dealName?: string;
  customerName?: string;
  unitName?: string;
  projectName?: string;
  signed: boolean;
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
  unitName?: string;
  unitStatus?: string;
  replayed: boolean;
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
