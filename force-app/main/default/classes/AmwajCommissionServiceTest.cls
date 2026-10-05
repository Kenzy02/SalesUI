/**
 * Commission rules: 1% of confirmed collections on signed EOIs, itemised,
 * recalculated from source (no double counting), refunds deducted, and
 * attributed to the deal owner taken from the session.
 */
@IsTest
private class AmwajCommissionServiceTest {
    // ---------------------------------------------------------- pure calculation

    private static EOI__c eoi(Boolean signed, Boolean feeVerified, Decimal fee, List<Map<String, Object>> reservations, String status) {
        Map<String, Object> rec = new Map<String, Object>{
            'attributes' => new Map<String, Object>{ 'type' => 'EOI__c' },
            'Id' => EOI__c.SObjectType.getDescribe().getKeyPrefix() + '000000000001',
            'Name' => 'EOI-TEST',
            'Status__c' => status,
            'EOI_Document_Attached__c' => signed,
            'PaymentVerifiedByFinance__c' => feeVerified,
            'Reservation_Fees__c' => fee,
            'Reservations__r' => new Map<String, Object>{ 'totalSize' => reservations.size(), 'done' => true, 'records' => reservations }
        };
        return (EOI__c) JSON.deserialize(JSON.serialize(rec), EOI__c.class);
    }

    private static Map<String, Object> reservation(Decimal deposit, Boolean verified) {
        return new Map<String, Object>{
            'attributes' => new Map<String, Object>{ 'type' => 'Reservation__c' },
            'DepositAmount__c' => deposit,
            'DepositVerified__c' => verified
        };
    }

    @IsTest
    static void onePercentOfConfirmedPropertyPaymentsAndBookingFees() {
        AmwajCommissionService.Line line = AmwajCommissionService.calculate(
            eoi(true, true, 10000, new List<Map<String, Object>>{ reservation(100000, true) }, 'Paid'),
            null,
            1
        );
        Assert.areEqual(100000, line.propertyPayments);
        Assert.areEqual(10000, line.bookingFees);
        Assert.areEqual(0, line.tax, 'The org records no tax amounts');
        Assert.areEqual(110000, line.eligibleBasis);
        Assert.areEqual(1100.00, line.commission);
        Assert.areEqual('ELIGIBLE', line.state);
    }

    @IsTest
    static void signingWithoutConfirmedCollectionsEarnsNothing() {
        AmwajCommissionService.Line line = AmwajCommissionService.calculate(
            eoi(true, false, 6000, new List<Map<String, Object>>{ reservation(40000, false) }, 'Submitted'),
            null,
            1
        );
        Assert.areEqual(0, line.commission);
        Assert.areEqual('NO_CONFIRMED_COLLECTIONS', line.state);
        Assert.areEqual(6000, line.unconfirmedBookingFees, 'Requested-but-unconfirmed amounts are shown, not counted');
        Assert.areEqual(40000, line.unconfirmedPropertyPayments);
    }

    @IsTest
    static void collectionsBeforeSigningBecomeEligibleOnceSigned() {
        List<Map<String, Object>> res = new List<Map<String, Object>>{ reservation(50000, true) };
        AmwajCommissionService.Line before = AmwajCommissionService.calculate(eoi(false, true, 5000, res, 'Paid'), null, 1);
        Assert.areEqual(0, before.commission);
        Assert.areEqual(55000, before.netCollected);
        Assert.areEqual('AWAITING_SIGNATURE', before.state);

        AmwajCommissionService.Line afterSigning = AmwajCommissionService.calculate(eoi(true, true, 5000, res, 'Paid'), null, 1);
        Assert.areEqual(550.00, afterSigning.commission);
    }

    @IsTest
    static void laterConfirmationsAddOnlyTheNewAmount() {
        List<Map<String, Object>> res = new List<Map<String, Object>>{ reservation(50000, true), reservation(30000, false) };
        Decimal first = AmwajCommissionService.calculate(eoi(true, true, 5000, res, 'Paid'), null, 1).commission;
        res[1].put('DepositVerified__c', true);
        Decimal second = AmwajCommissionService.calculate(eoi(true, true, 5000, res, 'Paid'), null, 1).commission;
        Assert.areEqual(550.00, first);
        Assert.areEqual(850.00, second, 'Earlier receipts are not counted twice');
    }

    @IsTest
    static void processedRefundsAreDeducted() {
        RefundRequest__c processed = new RefundRequest__c(Status__c = 'Processed', ApprovedAmount__c = 5000);
        RefundRequest__c pending = new RefundRequest__c(Status__c = 'Approved', ApprovedAmount__c = 9999);
        AmwajCommissionService.Line line = AmwajCommissionService.calculate(
            eoi(true, true, 5000, new List<Map<String, Object>>{ reservation(20000, true) }, 'Paid'),
            new List<RefundRequest__c>{ processed, pending },
            1
        );
        Assert.areEqual(5000, line.refunds, 'Only processed refunds reverse collections');
        Assert.areEqual(200.00, line.commission);

        AmwajCommissionService.Line refundedEoi = AmwajCommissionService.calculate(
            eoi(true, true, 5000, new List<Map<String, Object>>(), 'Refunded'),
            null,
            1
        );
        Assert.areEqual(0, refundedEoi.commission, 'A refunded EOI with no refund request falls back to the refunded fee');
    }

    @IsTest
    static void noRateMeansNoCommission() {
        AmwajCommissionService.Line line = AmwajCommissionService.calculate(
            eoi(true, true, 5000, new List<Map<String, Object>>(), 'Paid'),
            null,
            null
        );
        Assert.areEqual(0, line.commission);
    }

    // ---------------------------------------------------------- end to end, as sales users

    @IsTest
    static void commissionBelongsToTheDealOwnerOnly() {
        AmwajSalesTestData.createBaseline();
        User rep1 = AmwajSalesTestData.rep('rep1');
        Id eoiId;
        System.runAs(rep1) {
            eoiId = (Id) AmwajOfferService.createEoi(
                    AmwajSalesTestData.offer(
                        AmwajSalesTestData.deal('Hassan').Id,
                        AmwajSalesTestData.unitNamed('AW-U-001').Id,
                        AmwajSalesTestData.plan('AW-1090').Id
                    )
                )
                .get('eoiId');
        }
        AmwajSalesTestData.financeConfirmsEoi(eoiId); // signed document on file + fee verified

        AmwajCommissionService.rateOverride = 1;
        AmwajCommissionService.Result mine;
        AmwajCommissionService.Result theirs;
        Test.startTest();
        System.runAs(rep1) {
            mine = AmwajCommissionService.forCurrentUser();
        }
        System.runAs(AmwajSalesTestData.rep('rep2')) {
            theirs = AmwajCommissionService.forCurrentUser();
        }
        Test.stopTest();

        Decimal fee = AmwajSalesTestData.LIST_PRICE * AmwajOfferService.RESERVATION_FEE_RATE;
        Assert.areEqual(1, mine.lines.size());
        Assert.areEqual(fee, mine.bookingFees);
        Assert.areEqual((fee / 100).setScale(2), mine.commission);
        Assert.isFalse(mine.paidTracked, 'No authoritative commission-paid record exists in the org');
        Assert.areEqual(0, theirs.lines.size());
        Assert.areEqual(0, theirs.commission);
    }

    @IsTest
    static void defaultPolicyIsReadFromCustomMetadata() {
        Amwaj_Commission_Policy__mdt policy = Amwaj_Commission_Policy__mdt.getInstance('Default');
        Decimal expected = policy == null || policy.Is_Active__c != true ? null : policy.Rate__c;
        Assert.areEqual(expected, AmwajCommissionService.ratePct());
    }
}
