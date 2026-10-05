/**
 * EOI ("offer") and reservation creation through AmwajOfferService, run as a
 * sales executive against the org's real automation.
 */
@IsTest
private class AmwajOfferServiceTest {
    @TestSetup
    static void setup() {
        AmwajSalesTestData.createBaseline();
    }

    @IsTest
    static void createEoiHoldsUnitThroughOrgAutomation() {
        User rep1 = AmwajSalesTestData.rep('rep1');
        Opportunity deal = AmwajSalesTestData.deal('Hassan');
        Inventory__c unit = AmwajSalesTestData.unitNamed('AW-U-001');
        Id planId = AmwajSalesTestData.plan('AW-1090').Id;

        Map<String, Object> result;
        Test.startTest();
        System.runAs(rep1) {
            result = AmwajOfferService.createEoi(AmwajSalesTestData.offer(deal.Id, unit.Id, planId));
        }
        Test.stopTest();

        EOI__c eoi = [
            SELECT Status__c, ExpiryDate__c, Reservation_Fees__c, Inventory__r.Status__c, OwnerId, PersonAccount__c,
                LinkedOpportunity__r.EOI_Created__c
            FROM EOI__c
            WHERE Id = :(Id) result.get('eoiId')
        ];
        Assert.areEqual('Submitted', eoi.Status__c);
        Assert.areEqual(Date.today().addDays(AmwajSalesTestData.EOI_PERIOD_DAYS.intValue()), eoi.ExpiryDate__c, 'Expiry comes from the EOI flow');
        Assert.areEqual('Held', eoi.Inventory__r.Status__c, 'The EOI flow holds the unit');
        Assert.areEqual(AmwajSalesTestData.LIST_PRICE * AmwajOfferService.RESERVATION_FEE_RATE, eoi.Reservation_Fees__c);
        Assert.areEqual(rep1.Id, eoi.OwnerId);
        Assert.areEqual(deal.AccountId, eoi.PersonAccount__c);
        Assert.isTrue(eoi.LinkedOpportunity__r.EOI_Created__c);
        Assert.areEqual(false, result.get('replayed'));

        Account a = [SELECT NationalID__pc, District__pc, BillingCity FROM Account WHERE Id = :deal.AccountId];
        Assert.areEqual('199012345678', a.NationalID__pc, 'Required customer details are written like the flow does');
        Assert.areEqual('Baghdad', a.BillingCity);
    }

    @IsTest
    static void secondSalesUserCannotHoldTheSameUnit() {
        Inventory__c unit = AmwajSalesTestData.unitNamed('AW-U-001');
        Id planId = AmwajSalesTestData.plan('AW-1090').Id;
        System.runAs(AmwajSalesTestData.rep('rep1')) {
            AmwajOfferService.createEoi(AmwajSalesTestData.offer(AmwajSalesTestData.deal('Hassan').Id, unit.Id, planId));
        }
        Opportunity deal2 = AmwajSalesTestData.deal('Khaled');

        Test.startTest();
        System.runAs(AmwajSalesTestData.rep('rep2')) {
            try {
                AmwajOfferService.createEoi(AmwajSalesTestData.offer(deal2.Id, unit.Id, planId));
                Assert.fail('A held unit must not be offered again');
            } catch (AmwajSalesException e) {
                Assert.areEqual(409, e.statusCode);
                Assert.isTrue(e.getMessage().contains('no longer available'), e.getMessage());
            }
        }
        Test.stopTest();
        Assert.areEqual(1, [SELECT COUNT() FROM EOI__c WHERE Inventory__c = :unit.Id]);
        Assert.isFalse([SELECT EOI_Created__c FROM Opportunity WHERE Id = :deal2.Id].EOI_Created__c);
    }

    @IsTest
    static void retriedRequestReturnsTheSameEoi() {
        Opportunity deal = AmwajSalesTestData.deal('Hassan');
        Inventory__c unit = AmwajSalesTestData.unitNamed('AW-U-002');
        Id planId = AmwajSalesTestData.plan('AW-1090').Id;
        Map<String, Object> first;
        Map<String, Object> retry;
        Test.startTest();
        System.runAs(AmwajSalesTestData.rep('rep1')) {
            first = AmwajOfferService.createEoi(AmwajSalesTestData.offer(deal.Id, unit.Id, planId));
            retry = AmwajOfferService.createEoi(AmwajSalesTestData.offer(deal.Id, unit.Id, planId));
        }
        Test.stopTest();
        Assert.areEqual(first.get('eoiId'), retry.get('eoiId'));
        Assert.areEqual(true, retry.get('replayed'));
        Assert.areEqual(1, [SELECT COUNT() FROM EOI__c WHERE LinkedOpportunity__c = :deal.Id]);
    }

    @IsTest
    static void salesUserCannotUseAnotherUsersDeal() {
        Opportunity deal1 = AmwajSalesTestData.deal('Hassan');
        Test.startTest();
        System.runAs(AmwajSalesTestData.rep('rep2')) {
            try {
                AmwajOfferService.createEoi(
                    AmwajSalesTestData.offer(deal1.Id, AmwajSalesTestData.unitNamed('AW-U-001').Id, AmwajSalesTestData.plan('AW-1090').Id)
                );
                Assert.fail('rep2 must not act on rep1\'s private deal');
            } catch (AmwajSalesException e) {
                Assert.areEqual(404, e.statusCode, 'Private deals are invisible to peers');
            }
        }
        Test.stopTest();
        Assert.areEqual(0, [SELECT COUNT() FROM EOI__c]);
    }

    @IsTest
    static void invalidRequestsAreRejectedBeforeAnyWrite() {
        Opportunity deal = AmwajSalesTestData.deal('Hassan');
        Id unitId = AmwajSalesTestData.unitNamed('AW-U-001').Id;
        Id planId = AmwajSalesTestData.plan('AW-1090').Id;
        Test.startTest();
        System.runAs(AmwajSalesTestData.rep('rep1')) {
            AmwajOfferService.OfferRequest badId = AmwajSalesTestData.offer(deal.Id, unitId, planId);
            badId.customer.nationalId = '123';
            assertRejected(badId, 400, '12 digits');

            AmwajOfferService.OfferRequest badDiscount = AmwajSalesTestData.offer(deal.Id, unitId, planId);
            badDiscount.discountPct = 25;
            assertRejected(badDiscount, 400, '20%');

            AmwajOfferService.OfferRequest badMobile = AmwajSalesTestData.offer(deal.Id, unitId, planId);
            badMobile.customer.mobile = '0123';
            assertRejected(badMobile, 400, 'Iraqi mobile');

            assertRejected(AmwajSalesTestData.offer(deal.Id, unitId, AmwajSalesTestData.plan('AW-X').Id), 400, 'not available for this unit');
            assertRejected(AmwajSalesTestData.offer(deal.Id, AmwajSalesTestData.unitNamed('AW-U-SOLD').Id, planId), 409, 'no longer available');
            assertRejected(
                AmwajSalesTestData.offer(deal.Id, AmwajSalesTestData.unitNamed('AW-X-001').Id, AmwajSalesTestData.plan('AW-X').Id),
                409,
                'not open for sale'
            );
        }
        Test.stopTest();
        Assert.areEqual(0, [SELECT COUNT() FROM EOI__c]);
        Assert.areEqual('Available', AmwajSalesTestData.unitNamed('AW-U-001').Status__c);
    }

    @IsTest
    static void reservationNeedsPaidEoiThenHoldsForConfiguredDays() {
        User rep1 = AmwajSalesTestData.rep('rep1');
        Opportunity deal = AmwajSalesTestData.deal('Hassan');
        Id planId = AmwajSalesTestData.plan('AW-1090').Id;
        Id eoiId;
        System.runAs(rep1) {
            eoiId = (Id) AmwajOfferService.createEoi(
                    AmwajSalesTestData.offer(deal.Id, AmwajSalesTestData.unitNamed('AW-U-003').Id, planId)
                )
                .get('eoiId');
        }
        AmwajOfferService.ReservationRequest req = new AmwajOfferService.ReservationRequest();
        req.eoiId = eoiId;

        System.runAs(rep1) {
            try {
                AmwajOfferService.createReservation(req);
                Assert.fail('An unpaid EOI cannot be reserved');
            } catch (AmwajSalesException e) {
                Assert.areEqual(409, e.statusCode);
            }
        }

        AmwajSalesTestData.financeConfirmsEoi(eoiId);
        Map<String, Object> result;
        Test.startTest();
        System.runAs(rep1) {
            result = AmwajOfferService.createReservation(req);
        }
        Test.stopTest();

        Reservation__c res = [
            SELECT Status__c, HoldExpiry__c, DepositAmount__c, ListPrice__c, Opportunity__r.Reservation_Created__c
            FROM Reservation__c
            WHERE Id = :(Id) result.get('reservationId')
        ];
        Assert.areEqual('Submitted', res.Status__c);
        Assert.areEqual(Date.today().addDays(AmwajSalesTestData.HOLD_DAYS.intValue()), res.HoldExpiry__c, '14-day hold from the reservation flow');
        Assert.areEqual(AmwajSalesTestData.LIST_PRICE * 0.10, res.DepositAmount__c, 'Down payment from the org payment-plan subflow');
        Assert.areEqual(AmwajSalesTestData.LIST_PRICE, res.ListPrice__c);
        Assert.isTrue(res.Opportunity__r.Reservation_Created__c);
    }

    @IsTest
    static void signedEoiDocumentNeedsEoiEditAccess() {
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
        String pdf = EncodingUtil.base64Encode(Blob.valueOf('%PDF-1.4'));
        Map<String, Object> detail;
        Test.startTest();
        System.runAs(rep1) {
            // The Sales Executive permission set grants no Edit on EOI__c, so reps cannot file it.
            try {
                AmwajOfferService.attachSignedEoi(eoiId, 'Signed EOI.pdf', pdf);
                Assert.fail('Sales executives cannot edit EOIs in this org');
            } catch (AmwajSalesException e) {
                Assert.areEqual(403, e.statusCode);
            }
        }
        try {
            AmwajOfferService.attachSignedEoi(eoiId, 'signed.exe', pdf);
            Assert.fail('Only PDF and image files are accepted');
        } catch (AmwajSalesException e) {
            Assert.areEqual(400, e.statusCode);
        }
        // A user who may edit the EOI (here the admin running the test) files the document.
        detail = AmwajOfferService.attachSignedEoi(eoiId, 'Signed EOI.pdf', pdf);
        Test.stopTest();
        Assert.isTrue([SELECT EOI_Document_Attached__c FROM EOI__c WHERE Id = :eoiId].EOI_Document_Attached__c);
        Assert.areEqual(1, [SELECT COUNT() FROM ContentDocumentLink WHERE LinkedEntityId = :eoiId]);
        Assert.areEqual(1, ((List<Object>) detail.get('documents')).size());
        Assert.areEqual('AWAITING_FINANCE', detail.get('nextStep'));
    }

    @IsTest
    static void validationHelpers() {
        Assert.isTrue(AmwajOfferService.isValidMobile('07701234567'));
        Assert.isTrue(AmwajOfferService.isValidMobile('+9647701234567'));
        Assert.isFalse(AmwajOfferService.isValidMobile('0770123456'));
        Assert.areEqual(0, AmwajOfferService.validDiscount(null));
        Assert.areEqual(5, AmwajOfferService.validDiscount(5));
        try {
            AmwajOfferService.validDiscount(2.5);
            Assert.fail('Fractional discounts are not allowed by the EOI flow');
        } catch (AmwajSalesException e) {
            Assert.areEqual(400, e.statusCode);
        }
    }

    private static void assertRejected(AmwajOfferService.OfferRequest req, Integer status, String messagePart) {
        try {
            AmwajOfferService.createEoi(req);
            Assert.fail('Expected rejection: ' + messagePart);
        } catch (AmwajSalesException e) {
            Assert.areEqual(status, e.statusCode, e.getMessage());
            Assert.isTrue(e.getMessage().contains(messagePart), e.getMessage());
        }
    }
}
