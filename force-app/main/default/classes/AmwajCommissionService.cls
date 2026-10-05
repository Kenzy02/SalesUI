/**
 * Sales commission for the sales workspace, calculated on the server from
 * finance-confirmed records only. Nothing is stored: every call recalculates
 * from source records, so a later confirmation is picked up and no receipt
 * is ever counted twice.
 *
 * Verified org facts this relies on (no commission logic existed in the org):
 *  - Booking fee      = EOI__c.Reservation_Fees__c, confirmed when
 *                       EOI__c.PaymentVerifiedByFinance__c is true.
 *  - Property payment = Reservation__c.DepositAmount__c, confirmed when
 *                       Reservation__c.DepositVerified__c is true.
 *  - Tax              = not recorded anywhere in the org; reported as such.
 *  - Refunds          = RefundRequest__c in status Processed (approved amount),
 *                       or EOI__c.RefundedAmount__c on a Refunded EOI with no
 *                       processed refund request.
 *  - "Signed"         = EOI__c.EOI_Document_Attached__c: the signed EOI document
 *                       is on file (the org's evidence; there is no e-signature).
 *
 * Policy (agreed for the demo; rate from Amwaj_Commission_Policy__mdt.Default):
 * commission = rate x (confirmed booking fees + property payments + tax
 * - processed refunds) on EOIs whose signed document is on file. Collections
 * confirmed before signing count once the EOI is signed. Commission belongs
 * to the deal (Opportunity) owner, derived from the session user.
 */
public with sharing class AmwajCommissionService {
    @TestVisible
    private static Decimal rateOverride;

    public class Line {
        public Id eoiId;
        public String eoiName;
        public String eoiStatus;
        public Id dealId;
        public String dealName;
        public String customerName;
        public String unitName;
        public String projectName;
        public Boolean signed = false;
        public Decimal propertyPayments = 0;
        public Decimal bookingFees = 0;
        public Decimal tax = 0;
        public Decimal refunds = 0;
        public Decimal unconfirmedBookingFees = 0;
        public Decimal unconfirmedPropertyPayments = 0;
        public Decimal netCollected = 0;
        public Decimal eligibleBasis = 0;
        public Decimal commission = 0;
        /** ELIGIBLE | AWAITING_SIGNATURE | NO_CONFIRMED_COLLECTIONS */
        public String state;
    }

    public class Result {
        public Decimal ratePct;
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
        public List<Line> lines = new List<Line>();

        public Map<String, Object> summary() {
            return new Map<String, Object>{
                'ratePct' => ratePct,
                'currencyCode' => currencyCode,
                'commission' => commission,
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
        }
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
        line.customerName = e.Customer_Name__c;
        line.unitName = e.Inventory__r?.Name;
        line.projectName = e.Project__r?.Name;
        line.signed = e.EOI_Document_Attached__c == true;

        Decimal fee = nz(e.Reservation_Fees__c);
        if (e.PaymentVerifiedByFinance__c == true) {
            line.bookingFees = fee;
        } else {
            line.unconfirmedBookingFees = fee;
        }

        for (Reservation__c r : e.Reservations__r) {
            if (r.DepositVerified__c == true) {
                line.propertyPayments += nz(r.DepositAmount__c);
            } else {
                line.unconfirmedPropertyPayments += nz(r.DepositAmount__c);
            }
        }
        Boolean anyProcessedRefund = false;
        for (RefundRequest__c rr : refunds == null ? new List<RefundRequest__c>() : refunds) {
            if (rr.Status__c == 'Processed') {
                anyProcessedRefund = true;
                line.refunds += rr.ApprovedAmount__c != null ? rr.ApprovedAmount__c : nz(rr.RequestedAmount__c);
            }
        }
        if (!anyProcessedRefund && e.Status__c == 'Refunded') {
            line.refunds = e.RefundedAmount__c != null ? e.RefundedAmount__c : line.bookingFees;
        }

        Decimal gross = line.propertyPayments + line.bookingFees + line.tax;
        Decimal net = gross - line.refunds;
        line.netCollected = net < 0 ? 0.0 : net;
        if (!line.signed) {
            line.state = 'AWAITING_SIGNATURE';
        } else if (line.netCollected == 0) {
            line.state = 'NO_CONFIRMED_COLLECTIONS';
        } else {
            line.state = 'ELIGIBLE';
        }
        line.eligibleBasis = line.signed ? line.netCollected : 0.0;
        line.commission = ratePct == null ? 0.0 : (line.eligibleBasis * ratePct / 100).setScale(2, System.RoundingMode.HALF_UP);
        return line;
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

    private static Decimal nz(Decimal d) {
        return d == null ? 0 : d;
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
                    RefundedAmount__c, Customer_Name__c, LinkedOpportunity__c, LinkedOpportunity__r.Name,
                    Inventory__r.Name, Project__r.Name,
                    (SELECT Id, DepositAmount__c, DepositVerified__c FROM Reservations__r)
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
