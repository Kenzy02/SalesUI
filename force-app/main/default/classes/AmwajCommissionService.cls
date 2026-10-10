/**
 * Sales commission for the sales workspace, calculated on the server from
 * finance-confirmed records only. Nothing is stored: every call recalculates
 * from source records, so a later confirmation is picked up and no receipt
 * is ever counted twice.
 *
 * Amounts are reconciled by AmwajPaymentLedger (booking fee and deposit as
 * confirmed by finance, processed refunds deducted, carried-over deposits not
 * counted twice). Tax is not recorded anywhere in the org and is reported as
 * such. "Signed" = EOI__c.EOI_Document_Attached__c: the signed EOI document is
 * on file (the org's evidence; there is no e-signature).
 *
 * Policy (proposed for this workspace, not confirmed Amwaj policy; rate from
 * Amwaj_Commission_Policy__mdt.Default): commission = rate x (confirmed booking
 * fees + deposits + tax - processed refunds) on EOIs whose signed document is on
 * file. Collections confirmed before signing count once the EOI is signed.
 * Commission belongs to the deal (Opportunity) owner, derived from the session
 * user. A unit is sold when its reservation is Active (the org's flow then marks
 * the unit Sold and the deal Closed Won).
 */
public with sharing class AmwajCommissionService {
    @TestVisible
    private static Decimal rateOverride;

    /** No approval of the rate is recorded anywhere in the org; it was proposed for this workspace. */
    public static final String RATE_STATUS = 'PROPOSED_UNCONFIRMED';

    public class Line {
        public Id eoiId;
        public String eoiName;
        public String eoiStatus;
        public Id dealId;
        public String dealName;
        public Id customerId;
        public String customerName;
        public Id unitId;
        public String unitName;
        public Id projectId;
        public String projectName;
        public Boolean signed = false;
        /** SOLD | RESERVED | EOI_HOLD | CLOSED (AmwajPaymentLedger). */
        public String saleStatus;
        public Id reservationId;
        public String reservationName;
        public String reservationStatus;
        /** Reservation__c.ActivationDate__c (set by the org when the reservation becomes Active). */
        public Date saleDate;
        /** Reservation__c.NetPrice__c. Read in the user's own access; null when not shared with them. */
        public Decimal saleValue;
        /** False when the reservation or its price is not visible to the user. */
        public Boolean saleDetailsVisible = false;
        public Decimal propertyPayments = 0;
        public Decimal bookingFees = 0;
        public Decimal tax = 0;
        public Decimal refunds = 0;
        public Decimal unconfirmedBookingFees = 0;
        public Decimal unconfirmedPropertyPayments = 0;
        public Decimal excludedDeposits = 0;
        public Decimal netCollected = 0;
        public Decimal eligibleBasis = 0;
        public Decimal commission = 0;
        /** ELIGIBLE | AWAITING_SIGNATURE | NO_CONFIRMED_COLLECTIONS */
        public String state;
    }

    public class Result {
        public Decimal ratePct;
        public String rateStatus = RATE_STATUS;
        public String currencyCode;
        public Boolean taxRecorded = false;
        public Boolean paidTracked = false;
        public Decimal paid;
        public Decimal propertyPayments = 0;
        public Decimal bookingFees = 0;
        public Decimal tax = 0;
        public Decimal refunds = 0;
        public Decimal eligibleBasis = 0;
        public Decimal awaitingSignatureBasis = 0;
        public Decimal commission = 0;
        /** Split by whether the unit is sold; the two always add up to the totals above. */
        public Integer soldUnits = 0;
        public Decimal soldEligibleBasis = 0;
        public Decimal soldCommission = 0;
        public Decimal notSoldEligibleBasis = 0;
        public Decimal notSoldCommission = 0;
        /** Commission split by collection type, for display; the total above is the sum of the per-EOI amounts. */
        public Decimal propertyCommission = 0;
        public Decimal bookingFeeCommission = 0;
        public Decimal taxCommission = 0;
        public Decimal refundCommission = 0;
        public List<Line> lines = new List<Line>();

        public Map<String, Object> summary() {
            return new Map<String, Object>{
                'ratePct' => ratePct,
                'rateStatus' => rateStatus,
                'currencyCode' => currencyCode,
                'commission' => commission,
                'soldCommission' => soldCommission,
                'soldUnits' => soldUnits,
                'eligibleBasis' => eligibleBasis,
                'awaitingSignatureBasis' => awaitingSignatureBasis,
                'paidTracked' => paidTracked
            };
        }
    }

    public static Result forCurrentUser() {
        Result result = new Result();
        result.currencyCode = UserInfo.getDefaultCurrency();
        result.ratePct = ratePct();
        if (!Schema.SObjectType.Opportunity.isAccessible()) {
            return result;
        }
        Id me = UserInfo.getUserId();
        // The deals this user owns - checked in the user's own sharing context.
        Map<Id, Opportunity> deals = new Map<Id, Opportunity>([SELECT Id FROM Opportunity WHERE OwnerId = :me WITH USER_MODE]);
        if (deals.isEmpty()) {
            return result;
        }
        FinanceRecords finance = new FinanceRecords();
        List<EOI__c> eois = finance.eoisForDeals(deals.keySet());
        Map<Id, List<RefundRequest__c>> refundsByEoi = finance.refundsByEoi(new Map<Id, EOI__c>(eois).keySet());
        for (EOI__c e : eois) {
            Line line = calculate(e, refundsByEoi.get(e.Id), result.ratePct);
            result.lines.add(line);
            result.propertyPayments += line.signed ? line.propertyPayments : 0.0;
            result.bookingFees += line.signed ? line.bookingFees : 0.0;
            result.tax += line.signed ? line.tax : 0.0;
            result.refunds += line.signed ? line.refunds : 0.0;
            result.eligibleBasis += line.eligibleBasis;
            result.awaitingSignatureBasis += line.signed ? 0.0 : line.netCollected;
            result.commission += line.commission;
            if (line.saleStatus == AmwajPaymentLedger.SOLD) {
                result.soldUnits++;
                result.soldEligibleBasis += line.eligibleBasis;
                result.soldCommission += line.commission;
            } else {
                result.notSoldEligibleBasis += line.eligibleBasis;
                result.notSoldCommission += line.commission;
            }
        }
        addSaleDetails(result.lines);
        result.propertyCommission = commissionOn(result.propertyPayments, result.ratePct);
        result.bookingFeeCommission = commissionOn(result.bookingFees, result.ratePct);
        result.taxCommission = commissionOn(result.tax, result.ratePct);
        result.refundCommission = commissionOn(result.refunds, result.ratePct);
        return result;
    }

    @TestVisible
    private static Line calculate(EOI__c e, List<RefundRequest__c> refunds, Decimal ratePct) {
        Line line = new Line();
        line.eoiId = e.Id;
        line.eoiName = e.Name;
        line.eoiStatus = e.Status__c;
        line.dealId = e.LinkedOpportunity__c;
        line.dealName = e.LinkedOpportunity__r?.Name;
        line.customerId = e.PersonAccount__c != null ? e.PersonAccount__c : e.LinkedOpportunity__r?.AccountId;
        line.customerName = e.Customer_Name__c;
        line.unitId = e.Inventory__c;
        line.unitName = e.Inventory__r?.Name;
        line.projectId = e.Project__c;
        line.projectName = e.Project__r?.Name;
        line.signed = e.EOI_Document_Attached__c == true;

        List<Reservation__c> reservations = e.Reservations__r;
        line.saleStatus = AmwajPaymentLedger.saleStatus(e, reservations);
        for (Reservation__c r : reservations) {
            // Newest first: the live (or sold) reservation describes the sale.
            if (line.reservationId == null || AmwajPaymentLedger.isLive(r)) {
                line.reservationId = r.Id;
                line.reservationStatus = r.Status__c;
                if (AmwajPaymentLedger.isLive(r)) {
                    break;
                }
            }
        }

        AmwajPaymentLedger.UnitMoney money = AmwajPaymentLedger.reconcile(e, reservations, refunds);
        line.bookingFees = money.confirmedBookingFee;
        line.unconfirmedBookingFees = money.pendingBookingFee;
        line.propertyPayments = money.confirmedDeposits;
        line.unconfirmedPropertyPayments = money.pendingDeposits;
        line.excludedDeposits = money.excludedDeposits;
        line.refunds = money.refunds;
        line.netCollected = money.netConfirmed;
        if (!line.signed) {
            line.state = 'AWAITING_SIGNATURE';
        } else if (line.netCollected == 0) {
            line.state = 'NO_CONFIRMED_COLLECTIONS';
        } else {
            line.state = 'ELIGIBLE';
        }
        line.eligibleBasis = line.signed ? line.netCollected : 0.0;
        line.commission = commissionOn(line.eligibleBasis, ratePct);
        return line;
    }

    /**
     * Reservation number, sale value and sale date, read in the user's own access
     * (sharing and field security apply). A reservation the user cannot see keeps
     * these empty and is reported as not shared, rather than read in system mode.
     */
    private static void addSaleDetails(List<Line> lines) {
        Set<Id> ids = new Set<Id>();
        for (Line l : lines) {
            if (l.reservationId != null) {
                ids.add(l.reservationId);
            }
        }
        if (ids.isEmpty() || !Schema.SObjectType.Reservation__c.isAccessible()) {
            return;
        }
        Map<Id, SObject> visible = new Map<Id, SObject>(
            Database.query(
                'SELECT ' + AmwajSalesSupport.selectList(Reservation__c.SObjectType, new List<String>{ 'Name', 'NetPrice__c', 'ActivationDate__c' }) +
                ' FROM Reservation__c WHERE Id IN :ids WITH USER_MODE'
            )
        );
        for (Line l : lines) {
            SObject r = l.reservationId == null ? null : visible.get(l.reservationId);
            if (r != null) {
                l.reservationName = AmwajSalesSupport.str(r, 'Name');
                l.saleValue = AmwajSalesSupport.num(r, 'NetPrice__c');
                l.saleDate = (Date) AmwajSalesSupport.val(r, 'ActivationDate__c');
                l.saleDetailsVisible = AmwajSalesSupport.canRead(Reservation__c.SObjectType, 'NetPrice__c');
            }
        }
    }

    private static Decimal commissionOn(Decimal amount, Decimal ratePct) {
        return ratePct == null ? 0.0 : (amount * ratePct / 100).setScale(2, System.RoundingMode.HALF_UP);
    }

    /** Commission rate in percent (1 = 1%), configured by admins in custom metadata. */
    @TestVisible
    private static Decimal ratePct() {
        if (rateOverride != null) {
            return rateOverride;
        }
        Amwaj_Commission_Policy__mdt policy = Amwaj_Commission_Policy__mdt.getInstance('Default');
        return policy == null || policy.Is_Active__c != true ? null : policy.Rate__c;
    }

    /**
     * Finance records behind the user's own deals. Runs without sharing because
     * EOIs and reservations on a deal may be owned by colleagues (finance,
     * contracts, admins); it is only ever given deal ids the user owns, and only
     * amounts and statuses leave this class.
     */
    private without sharing class FinanceRecords {
        List<EOI__c> eoisForDeals(Set<Id> dealIds) {
            return [
                SELECT Id, Name, Status__c, EOI_Document_Attached__c, PaymentVerifiedByFinance__c, Reservation_Fees__c,
                    RefundedAmount__c, Customer_Name__c, PersonAccount__c, LinkedOpportunity__c, LinkedOpportunity__r.Name,
                    LinkedOpportunity__r.AccountId, Inventory__c, Inventory__r.Name, Project__c, Project__r.Name,
                    (SELECT Id, Status__c, DepositAmount__c, DepositVerified__c FROM Reservations__r ORDER BY CreatedDate DESC)
                FROM EOI__c
                WHERE LinkedOpportunity__c IN :dealIds
                WITH SYSTEM_MODE
                ORDER BY CreatedDate DESC
            ];
        }

        /** Refund requests raised on each EOI or on one of its reservations, each listed once. */
        Map<Id, List<RefundRequest__c>> refundsByEoi(Set<Id> eoiIds) {
            Map<Id, List<RefundRequest__c>> byEoi = new Map<Id, List<RefundRequest__c>>();
            for (RefundRequest__c rr : [
                SELECT Id, Status__c, ApprovedAmount__c, RequestedAmount__c, EOI__c, Reservation__r.EOI__c
                FROM RefundRequest__c
                WHERE EOI__c IN :eoiIds OR Reservation__r.EOI__c IN :eoiIds
                WITH SYSTEM_MODE
            ]) {
                Id eoiId = rr.EOI__c != null ? rr.EOI__c : rr.Reservation__r.EOI__c;
                if (!byEoi.containsKey(eoiId)) {
                    byEoi.put(eoiId, new List<RefundRequest__c>());
                }
                byEoi.get(eoiId).add(rr);
            }
            return byEoi;
        }
    }
}
