/**
 * What a customer has actually paid on one unit, reconciled from the only
 * money records the org keeps. Shared by the customer portfolio and the
 * commission estimate so both count every amount the same way.
 *
 * Verified org facts (flows New_Reservation_From_Opportunity,
 * EOI_Update_Before_Actions, Reservation_Update_Before_Actions,
 * Refund_Request_Update_After_Actions):
 *  - Booking fee  = EOI__c.Reservation_Fees__c, confirmed when finance ticks
 *                   PaymentVerifiedByFinance__c. The org's reservation screen
 *                   labels it "EOI Percent (1.5%, additional)": it is charged on
 *                   top of the price and is never deducted from it.
 *  - Deposit      = Reservation__c.DepositAmount__c (the plan's down payment, or
 *                   the amount entered for cash), confirmed when finance ticks
 *                   DepositVerified__c. The screen says it "will be deducted from
 *                   the total Unit Price".
 *  - Refund       = RefundRequest__c in status Processed. Processing also stamps
 *                   the same amount on EOI__c.RefundedAmount__c, so the EOI field
 *                   is only used when no processed request is visible (never both).
 *  - Price        = Reservation__c.NetPrice__c (list price snapshot less discount).
 *  - Sold         = Reservation__c.Status__c Active (the org's flow then marks the
 *                   unit Sold and the deal Closed Won).
 *  - Not recorded = instalment schedules, instalment receipts, due dates, tax.
 *                   PaymentPlanInstallment__c rows are plan templates, not a
 *                   customer's obligations, so they are not used here.
 *
 * Fields are read with AmwajSalesSupport.val(), so records queried in user mode
 * with unreadable fields stripped are handled (absent = not recorded).
 */
public with sharing class AmwajPaymentLedger {
    public static final String SOLD = 'SOLD';
    public static final String RESERVED = 'RESERVED';
    public static final String EOI_HOLD = 'EOI_HOLD';
    public static final String CLOSED = 'CLOSED';

    public class UnitMoney {
        /** EOI__c.Reservation_Fees__c; null when there is no EOI or no fee is recorded. */
        public Decimal bookingFee;
        public Boolean bookingFeeConfirmed = false;
        public Date bookingFeeConfirmedDate;
        public Decimal confirmedBookingFee = 0;
        /** Fee on a live EOI that finance has not confirmed yet. */
        public Decimal pendingBookingFee = 0;
        public Decimal confirmedDeposits = 0;
        /** Confirmed deposit on the live or sold reservation: the part of the price already paid. */
        public Decimal confirmedTowardPrice = 0;
        /** Deposit on a live reservation that finance has not confirmed yet. */
        public Decimal pendingDeposits = 0;
        /** Confirmed deposits on cancelled reservations not counted because a later reservation on the same EOI has its own. */
        public Decimal excludedDeposits = 0;
        public Decimal refunds = 0;
        /** REFUND_REQUEST, EOI or null (no processed refund). */
        public String refundSource;
        /** Confirmed booking fee + confirmed deposits - processed refunds, never below zero. */
        public Decimal netConfirmed = 0;
        /** Reservation__c.NetPrice__c of the live or sold reservation; null when there is none. */
        public Decimal price;
        public List<String> flags = new List<String>();
    }

    public static UnitMoney reconcile(SObject eoi, List<SObject> reservations, List<SObject> refunds) {
        UnitMoney m = new UnitMoney();
        reservations = reservations == null ? new List<SObject>() : reservations;
        refunds = refunds == null ? new List<SObject>() : refunds;

        String eoiStatus = eoi == null ? null : AmwajSalesSupport.str(eoi, 'Status__c');
        if (eoi != null) {
            m.bookingFee = AmwajSalesSupport.num(eoi, 'Reservation_Fees__c');
            m.bookingFeeConfirmed = AmwajSalesSupport.bool(eoi, 'PaymentVerifiedByFinance__c');
            m.bookingFeeConfirmedDate = (Date) AmwajSalesSupport.val(eoi, 'PaymentVerifiedDate__c');
            if (m.bookingFeeConfirmed) {
                m.confirmedBookingFee = nz(m.bookingFee);
            } else if (eoiStatus == 'Submitted') {
                m.pendingBookingFee = nz(m.bookingFee);
            }
        }

        Boolean liveHasConfirmedDeposit = false;
        for (SObject r : reservations) {
            if (isLive(r) && AmwajSalesSupport.bool(r, 'DepositVerified__c') && nz(AmwajSalesSupport.num(r, 'DepositAmount__c')) > 0) {
                liveHasConfirmedDeposit = true;
            }
        }
        for (SObject r : reservations) {
            Decimal deposit = nz(AmwajSalesSupport.num(r, 'DepositAmount__c'));
            Boolean confirmed = AmwajSalesSupport.bool(r, 'DepositVerified__c');
            if (isLive(r)) {
                m.price = AmwajSalesSupport.num(r, 'NetPrice__c');
                if (confirmed) {
                    m.confirmedDeposits += deposit;
                    m.confirmedTowardPrice += deposit;
                } else if (AmwajSalesSupport.str(r, 'Status__c') != 'Active') {
                    m.pendingDeposits += deposit;
                }
            } else if (confirmed && deposit > 0) {
                if (liveHasConfirmedDeposit) {
                    // The org has no record of whether this money was carried into the newer
                    // reservation or refunded, so it is not counted a second time.
                    m.excludedDeposits += deposit;
                    addFlag(m, 'POSSIBLE_CARRIED_DEPOSIT');
                } else {
                    m.confirmedDeposits += deposit;
                }
            }
        }

        Boolean processedRequest = false;
        for (SObject rr : refunds) {
            if (AmwajSalesSupport.str(rr, 'Status__c') == 'Processed') {
                processedRequest = true;
                Decimal approved = AmwajSalesSupport.num(rr, 'ApprovedAmount__c');
                m.refunds += approved != null ? approved : nz(AmwajSalesSupport.num(rr, 'RequestedAmount__c'));
            }
        }
        if (processedRequest) {
            m.refundSource = 'REFUND_REQUEST';
        } else if (eoiStatus == 'Refunded') {
            Decimal refunded = AmwajSalesSupport.num(eoi, 'RefundedAmount__c');
            m.refunds = refunded != null ? refunded : m.confirmedBookingFee;
            m.refundSource = 'EOI';
        }

        Decimal net = m.confirmedBookingFee + m.confirmedDeposits - m.refunds;
        m.netConfirmed = net < 0 ? 0 : net;
        if (eoiStatus == 'Expired' && m.confirmedBookingFee > 0 && m.refunds == 0) {
            addFlag(m, 'EXPIRED_FEE_NOT_REFUNDED');
        }
        return m;
    }

    /** Where the unit stands for this customer: SOLD, RESERVED, EOI_HOLD or CLOSED. */
    public static String saleStatus(SObject eoi, List<SObject> reservations) {
        Boolean anyLive = false;
        Boolean anyEnded = false;
        for (SObject r : reservations == null ? new List<SObject>() : reservations) {
            if (AmwajSalesSupport.str(r, 'Status__c') == 'Active') {
                return SOLD;
            }
            if (isLive(r)) {
                anyLive = true;
            } else {
                anyEnded = true;
            }
        }
        if (anyLive) {
            return RESERVED;
        }
        String eoiStatus = eoi == null ? null : AmwajSalesSupport.str(eoi, 'Status__c');
        if (!anyEnded && (eoiStatus == 'Submitted' || eoiStatus == 'Paid')) {
            return EOI_HOLD;
        }
        return CLOSED;
    }

    public static Boolean isLive(SObject reservation) {
        return !AmwajSalesSupport.LIVE_RESERVATION_EXCLUDED_STATUSES.contains(AmwajSalesSupport.str(reservation, 'Status__c'));
    }

    private static void addFlag(UnitMoney m, String flag) {
        if (!m.flags.contains(flag)) {
            m.flags.add(flag);
        }
    }

    private static Decimal nz(Decimal d) {
        return d == null ? 0 : d;
    }
}
