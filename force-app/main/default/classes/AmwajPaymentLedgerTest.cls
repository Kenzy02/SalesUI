/**
 * Payment reconciliation rules: what counts as paid, what is still awaiting
 * finance, how refunds and carried-over deposits are treated, and how a unit's
 * sale status is derived. Pure calculations on in-memory records.
 */
@IsTest
private class AmwajPaymentLedgerTest {
    private static Integer seq = 0;

    /** Records built through JSON so formula fields (NetPrice__c) can be set. */
    private static SObject rec(String objectType, Map<String, Object> fields) {
        Map<String, Object> m = new Map<String, Object>(fields);
        m.put('attributes', new Map<String, Object>{ 'type' => objectType });
        if (!m.containsKey('Id')) {
            String prefix = Schema.getGlobalDescribe().get(objectType).getDescribe().getKeyPrefix();
            m.put('Id', prefix + String.valueOf(++seq).leftPad(12, '0'));
        }
        return (SObject) JSON.deserialize(JSON.serialize(m), Type.forName(objectType));
    }

    private static SObject eoi(String status, Decimal fee, Boolean verified) {
        return rec('EOI__c', new Map<String, Object>{ 'Status__c' => status, 'Reservation_Fees__c' => fee, 'PaymentVerifiedByFinance__c' => verified });
    }

    private static SObject reservation(String status, Decimal deposit, Boolean verified, Decimal netPrice) {
        return rec('Reservation__c', new Map<String, Object>{
            'Status__c' => status, 'DepositAmount__c' => deposit, 'DepositVerified__c' => verified, 'NetPrice__c' => netPrice
        });
    }

    private static SObject refund(String status, Decimal approved) {
        return rec('RefundRequest__c', new Map<String, Object>{ 'Status__c' => status, 'ApprovedAmount__c' => approved, 'RequestedAmount__c' => 1 });
    }

    @IsTest
    static void bookingFeeIsPaidOnTopOfThePriceAndTheDepositCountsTowardIt() {
        AmwajPaymentLedger.UnitMoney m = AmwajPaymentLedger.reconcile(
            eoi('Paid', 4500, true),
            new List<SObject>{ reservation('Active', 30000, true, 300000) },
            null
        );
        Assert.areEqual(4500, m.confirmedBookingFee);
        Assert.areEqual(30000, m.confirmedDeposits);
        Assert.areEqual(34500, m.netConfirmed, 'Fee and deposit are separate receipts');
        Assert.areEqual(30000, m.confirmedTowardPrice, 'The booking fee is additional, never deducted from the price');
        Assert.areEqual(300000, m.price);
        Assert.areEqual(0, m.pendingBookingFee + m.pendingDeposits);
    }

    @IsTest
    static void unconfirmedAmountsArePendingOnlyWhileTheRecordIsLive() {
        AmwajPaymentLedger.UnitMoney live = AmwajPaymentLedger.reconcile(eoi('Submitted', 3000, false), null, null);
        Assert.areEqual(0, live.netConfirmed, 'Requested but unconfirmed money is never counted as paid');
        Assert.areEqual(3000, live.pendingBookingFee);

        AmwajPaymentLedger.UnitMoney expired = AmwajPaymentLedger.reconcile(eoi('Expired', 3000, false), null, null);
        Assert.areEqual(0, expired.pendingBookingFee, 'An expired, unpaid EOI owes nothing');

        AmwajPaymentLedger.UnitMoney reserved = AmwajPaymentLedger.reconcile(
            eoi('Paid', 3000, true),
            new List<SObject>{ reservation('Submitted', 20000, false, 200000) },
            null
        );
        Assert.areEqual(3000, reserved.netConfirmed);
        Assert.areEqual(20000, reserved.pendingDeposits);
        Assert.areEqual(0, reserved.confirmedTowardPrice);
    }

    @IsTest
    static void depositOnACancelledReservationIsNotCountedTwice() {
        AmwajPaymentLedger.UnitMoney m = AmwajPaymentLedger.reconcile(
            eoi('Paid', 3000, true),
            new List<SObject>{ reservation('PendingWithContracts', 25000, true, 250000), reservation('Cancelled', 25000, true, 250000) },
            null
        );
        Assert.areEqual(25000, m.confirmedDeposits, 'Only the live reservation\'s deposit counts');
        Assert.areEqual(25000, m.excludedDeposits);
        Assert.isTrue(m.flags.contains('POSSIBLE_CARRIED_DEPOSIT'));
        Assert.areEqual(28000, m.netConfirmed);

        AmwajPaymentLedger.UnitMoney alone = AmwajPaymentLedger.reconcile(
            eoi('Expired', 3000, true),
            new List<SObject>{ reservation('Cancelled', 25000, true, 250000) },
            null
        );
        Assert.areEqual(28000, alone.netConfirmed, 'Confirmed money with no processed refund is still held for the customer');
        Assert.isTrue(alone.flags.contains('EXPIRED_FEE_NOT_REFUNDED'));
        Assert.isNull(alone.price, 'A cancelled reservation is no longer an obligation');
    }

    @IsTest
    static void processedRefundsAreDeductedOnceAndOtherStatusesIgnored() {
        SObject refunded = rec('EOI__c', new Map<String, Object>{
            'Status__c' => 'Refunded', 'Reservation_Fees__c' => 3000, 'PaymentVerifiedByFinance__c' => true, 'RefundedAmount__c' => 1200
        });
        AmwajPaymentLedger.UnitMoney both = AmwajPaymentLedger.reconcile(
            refunded,
            null,
            new List<SObject>{ refund('Processed', 1200), refund('Approved', 999), refund('Submitted', 500) }
        );
        Assert.areEqual(1200, both.refunds, 'The EOI stamp and the processed request are the same money');
        Assert.areEqual('REFUND_REQUEST', both.refundSource);
        Assert.areEqual(1800, both.netConfirmed, 'Partial refund leaves the rest of the fee paid');

        AmwajPaymentLedger.UnitMoney stampOnly = AmwajPaymentLedger.reconcile(refunded, null, null);
        Assert.areEqual(1200, stampOnly.refunds, 'Refund requests raised by finance may not be shared with the rep; the EOI stamp is used');
        Assert.areEqual('EOI', stampOnly.refundSource);

        AmwajPaymentLedger.UnitMoney over = AmwajPaymentLedger.reconcile(
            eoi('Refunded', 3000, true),
            null,
            new List<SObject>{ refund('Processed', 5000) }
        );
        Assert.areEqual(0, over.netConfirmed, 'Never below zero');
    }

    @IsTest
    static void missingValuesAreNotTurnedIntoZeroPrices() {
        AmwajPaymentLedger.UnitMoney m = AmwajPaymentLedger.reconcile(
            rec('EOI__c', new Map<String, Object>{ 'Status__c' => 'Paid' }),
            new List<SObject>{ rec('Reservation__c', new Map<String, Object>{ 'Status__c' => 'Submitted' }) },
            null
        );
        Assert.isNull(m.bookingFee, 'No fee recorded');
        Assert.isNull(m.price, 'No price visible');
        Assert.areEqual(0, m.netConfirmed);
    }

    @IsTest
    static void saleStatusFollowsTheReservationThenTheEoi() {
        Assert.areEqual(AmwajPaymentLedger.SOLD, AmwajPaymentLedger.saleStatus(eoi('Paid', 1, true), new List<SObject>{ reservation('Active', 1, true, 1) }));
        Assert.areEqual(AmwajPaymentLedger.RESERVED, AmwajPaymentLedger.saleStatus(eoi('Paid', 1, true), new List<SObject>{ reservation('Submitted', 1, false, 1) }));
        Assert.areEqual(AmwajPaymentLedger.RESERVED, AmwajPaymentLedger.saleStatus(null, new List<SObject>{ reservation('PendingWithContracts', 1, true, 1) }));
        Assert.areEqual(AmwajPaymentLedger.EOI_HOLD, AmwajPaymentLedger.saleStatus(eoi('Submitted', 1, false), null));
        Assert.areEqual(AmwajPaymentLedger.EOI_HOLD, AmwajPaymentLedger.saleStatus(eoi('Paid', 1, true), new List<SObject>()));
        Assert.areEqual(AmwajPaymentLedger.CLOSED, AmwajPaymentLedger.saleStatus(eoi('Expired', 1, false), null));
        Assert.areEqual(AmwajPaymentLedger.CLOSED, AmwajPaymentLedger.saleStatus(eoi('Refunded', 1, true), null));
        Assert.areEqual(
            AmwajPaymentLedger.CLOSED,
            AmwajPaymentLedger.saleStatus(eoi('Paid', 1, true), new List<SObject>{ reservation('Cancelled', 1, true, 1) }),
            'A paid EOI whose reservation was cancelled no longer holds the unit'
        );
    }
}
