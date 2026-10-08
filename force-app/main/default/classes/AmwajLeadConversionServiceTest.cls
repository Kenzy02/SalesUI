/**
 * Lead conversion through AmwajLeadConversionService and the booking that
 * follows it, run as a sales executive (Amwaj User profile + Amwaj_SalesExec_PS
 * + SalesUI_Access) against the org's real conversion setup and automation.
 */
@IsTest
private class AmwajLeadConversionServiceTest {
    @TestSetup
    static void setup() {
        AmwajSalesTestData.createBaseline();
    }

    private static Lead newLead(String lastName, String mobile, String company, Id ownerId) {
        Lead l = new Lead(
            FirstName = 'Test',
            LastName = lastName,
            Company = company,
            Status = 'Working',
            MobilePhone = mobile,
            OwnerId = ownerId,
            Assigned__c = true,
            Project_Interest__c = [SELECT Id FROM Project__c WHERE Name = 'Workspace Test Project'].Id
        );
        insert l;
        return l;
    }

    private static AmwajLeadConversionService.ConvertRequest request(String lastName, String mobile) {
        AmwajLeadConversionService.ConvertRequest req = new AmwajLeadConversionService.ConvertRequest();
        req.firstName = 'Test';
        req.lastName = lastName;
        req.mobile = mobile;
        return req;
    }

    @IsTest
    static void convertsAnIndividualLeadIntoAPersonAccountAndDeal() {
        User rep1 = AmwajSalesTestData.rep('rep1');
        Lead l = newLead('Karim', '07709998877', 'Individual', rep1.Id);
        AmwajLeadConversionService.ConvertRequest req = request('Karim', '07709998877');
        req.nationalId = '199055556666';

        Map<String, Object> result;
        Test.startTest();
        System.runAs(rep1) {
            Map<String, Object> review = AmwajLeadConversionService.review(l.Id);
            Assert.isTrue((Boolean) review.get('canConvert'), String.valueOf(review.get('blockers')));
            result = AmwajLeadConversionService.convert(l.Id, req);
        }
        Test.stopTest();

        Lead after = [SELECT IsConverted, Status, ConvertedAccountId, ConvertedOpportunityId FROM Lead WHERE Id = :l.Id];
        Assert.isTrue(after.IsConverted);
        Assert.areEqual('Qualified', after.Status, 'The org\'s converted status is used');
        Account a = [SELECT IsPersonAccount, NationalID__pc, OwnerId FROM Account WHERE Id = :after.ConvertedAccountId];
        Assert.isTrue(a.IsPersonAccount, 'The "Individual" placeholder must not create a business account');
        Assert.areEqual('199055556666', a.NationalID__pc, 'Lead Convert field mapping applies');
        Opportunity o = [SELECT OwnerId, OriginatingLead__c, Project__c, AccountId FROM Opportunity WHERE Id = :after.ConvertedOpportunityId];
        Assert.areEqual(rep1.Id, o.OwnerId);
        Assert.areEqual(l.Id, o.OriginatingLead__c);
        Assert.areEqual(a.Id, o.AccountId);
        Assert.areEqual(after.ConvertedOpportunityId, result.get('dealId'));
        Assert.areEqual(true, result.get('createdCustomer'));
        Assert.areEqual(true, result.get('canContinue'));
        Assert.areEqual(0, [SELECT COUNT() FROM Account WHERE Name = 'Individual'], 'No placeholder business account');
    }

    @IsTest
    static void retriedConversionReturnsTheSameCustomerAndDeal() {
        User rep1 = AmwajSalesTestData.rep('rep1');
        Lead l = newLead('Retry', '07709998878', 'Individual', rep1.Id);
        Map<String, Object> first;
        Map<String, Object> retry;
        Map<String, Object> review;
        Test.startTest();
        System.runAs(rep1) {
            first = AmwajLeadConversionService.convert(l.Id, request('Retry', '07709998878'));
            retry = AmwajLeadConversionService.convert(l.Id, request('Retry', '07709998878'));
            review = AmwajLeadConversionService.review(l.Id);
        }
        Test.stopTest();
        Assert.areEqual(true, retry.get('replayed'));
        Assert.areEqual(first.get('accountId'), retry.get('accountId'));
        Assert.areEqual(first.get('dealId'), retry.get('dealId'));
        Assert.areEqual(first.get('dealId'), review.get('dealId'), 'An already converted lead resolves to its deal');
        Assert.areEqual(1, [SELECT COUNT() FROM Account WHERE LastName = 'Retry']);
        Assert.areEqual(1, [SELECT COUNT() FROM Opportunity WHERE Account.LastName = 'Retry']);
    }

    @IsTest
    static void matchesAnExistingCustomerAndContinuesTheirOpenDeal() {
        User rep1 = AmwajSalesTestData.rep('rep1');
        Opportunity deal = AmwajSalesTestData.deal('Hassan'); // Omar Hassan, mobile 07701234567, owned by rep1
        Lead l = newLead('Hassan', '07701234567', 'Individual', rep1.Id);
        Map<String, Object> review;
        Map<String, Object> result;
        Map<String, Object> retry;
        Test.startTest();
        System.runAs(rep1) {
            review = AmwajLeadConversionService.review(l.Id);
            AmwajLeadConversionService.ConvertRequest req = request('Hassan', '07701234567');
            req.accountId = deal.AccountId;
            req.dealId = deal.Id;
            result = AmwajLeadConversionService.convert(l.Id, req);
            retry = AmwajLeadConversionService.convert(l.Id, req);
        }
        Test.stopTest();

        List<Object> matches = (List<Object>) review.get('matches');
        Assert.areEqual(1, matches.size(), 'The org\'s duplicate check finds the customer by mobile');
        Map<String, Object> match = (Map<String, Object>) matches[0];
        Assert.areEqual(deal.AccountId, match.get('id'));
        Assert.isTrue(((List<String>) match.get('matchedOn')).contains('mobile'));
        Assert.areEqual(1, ((List<Object>) match.get('openDeals')).size());

        Lead after = [SELECT ConvertedAccountId, ConvertedOpportunityId, Buyer__c FROM Lead WHERE Id = :l.Id];
        Assert.areEqual(deal.AccountId, after.ConvertedAccountId, 'Converted into the existing customer');
        Assert.isNull(after.ConvertedOpportunityId, 'No second deal');
        Assert.areEqual(deal.AccountId, after.Buyer__c, 'The chosen buyer is recorded on the lead');
        Assert.areEqual(deal.Id, result.get('dealId'));
        Assert.areEqual(false, result.get('createdCustomer'));
        Assert.areEqual(deal.Id, retry.get('dealId'), 'A retry resolves the same deal');
        Assert.areEqual(1, [SELECT COUNT() FROM Opportunity WHERE AccountId = :deal.AccountId]);
    }

    @IsTest
    static void aCustomerThatDoesNotMatchCannotBeChosen() {
        User rep1 = AmwajSalesTestData.rep('rep1');
        Opportunity other = AmwajSalesTestData.deal('Khaled');
        Lead l = newLead('Nomatch', '07709998879', 'Individual', rep1.Id);
        Test.startTest();
        System.runAs(rep1) {
            AmwajLeadConversionService.ConvertRequest req = request('Nomatch', '07709998879');
            req.accountId = other.AccountId;
            try {
                AmwajLeadConversionService.convert(l.Id, req);
                Assert.fail('Only matched customers may be chosen');
            } catch (AmwajSalesException e) {
                Assert.areEqual(400, e.statusCode);
            }
        }
        Test.stopTest();
        Assert.isFalse([SELECT IsConverted FROM Lead WHERE Id = :l.Id].IsConverted);
    }

    @IsTest
    static void aLeadLinkedToABuyerConvertsIntoThatBuyer() {
        User rep1 = AmwajSalesTestData.rep('rep1');
        Opportunity deal = AmwajSalesTestData.deal('Hassan');
        Opportunity other = AmwajSalesTestData.deal('Khaled');
        Lead l = newLead('Linked', '07709998880', 'Individual', rep1.Id);
        update new Lead(Id = l.Id, Buyer__c = deal.AccountId);
        Test.startTest();
        System.runAs(rep1) {
            AmwajLeadConversionService.ConvertRequest wrong = request('Linked', '07709998880');
            wrong.accountId = other.AccountId;
            try {
                AmwajLeadConversionService.convert(l.Id, wrong);
                Assert.fail('The linked buyer rule must be respected');
            } catch (AmwajSalesException e) {
                Assert.areEqual(400, e.statusCode);
            }
            AmwajLeadConversionService.convert(l.Id, request('Linked', '07709998880'));
        }
        Test.stopTest();
        Assert.areEqual(deal.AccountId, [SELECT ConvertedAccountId FROM Lead WHERE Id = :l.Id].ConvertedAccountId);
    }

    @IsTest
    static void companyLeadsAndInvalidDetailsAreNotConverted() {
        User rep1 = AmwajSalesTestData.rep('rep1');
        Lead company = newLead('Firm', '07709998881', 'Acme Trading', rep1.Id);
        Lead person = newLead('Person', '07709998882', null, rep1.Id);
        Test.startTest();
        System.runAs(rep1) {
            Map<String, Object> review = AmwajLeadConversionService.review(company.Id);
            Assert.isFalse((Boolean) review.get('canConvert'));
            try {
                AmwajLeadConversionService.convert(company.Id, request('Firm', '07709998881'));
                Assert.fail('Company leads are not converted here');
            } catch (AmwajSalesException e) {
                Assert.areEqual(403, e.statusCode);
            }
            AmwajLeadConversionService.ConvertRequest badMobile = request('Person', '12345');
            AmwajLeadConversionService.ConvertRequest badId = request('Person', '07709998882');
            badId.nationalId = '12345';
            for (AmwajLeadConversionService.ConvertRequest bad : new List<AmwajLeadConversionService.ConvertRequest>{ badMobile, badId }) {
                try {
                    AmwajLeadConversionService.convert(person.Id, bad);
                    Assert.fail('Invalid details must be rejected');
                } catch (AmwajSalesException e) {
                    Assert.areEqual(400, e.statusCode);
                }
            }
        }
        Test.stopTest();
        Assert.areEqual(0, [SELECT COUNT() FROM Lead WHERE Id IN (:company.Id, :person.Id) AND IsConverted = TRUE]);
    }

    @IsTest
    static void anotherSalesUserCannotConvertMyLead() {
        Lead l = newLead('Private', '07709998883', 'Individual', AmwajSalesTestData.rep('rep1').Id);
        Test.startTest();
        System.runAs(AmwajSalesTestData.rep('rep2')) {
            try {
                AmwajLeadConversionService.convert(l.Id, request('Private', '07709998883'));
                Assert.fail('Leads are private');
            } catch (AmwajSalesException e) {
                Assert.areEqual(404, e.statusCode);
            }
        }
        Test.stopTest();
        Assert.isFalse([SELECT IsConverted FROM Lead WHERE Id = :l.Id].IsConverted);
    }

    @IsTest
    static void bookingAfterConversionKeepsTheDealWhenTheFirstAttemptFails() {
        User rep1 = AmwajSalesTestData.rep('rep1');
        Lead l = newLead('Booker', '07709998884', 'Individual', rep1.Id);
        // No recorded project interest: the deal takes the project of the unit actually booked, as the EOI flow does.
        update new Lead(Id = l.Id, Project_Interest__c = null);
        Inventory__c sold = AmwajSalesTestData.unitNamed('AW-U-SOLD');
        Inventory__c unit = AmwajSalesTestData.unitNamed('AW-U-003');
        Id planId = AmwajSalesTestData.plan('AW-1090').Id;
        Map<String, Object> eoi;
        Id dealId;
        Test.startTest();
        System.runAs(rep1) {
            dealId = (Id) AmwajLeadConversionService.convert(l.Id, request('Booker', '07709998884')).get('dealId');
            try {
                AmwajOfferService.createEoi(AmwajSalesTestData.offer(dealId, sold.Id, planId));
                Assert.fail('A sold unit cannot be held');
            } catch (AmwajSalesException e) {
                Assert.areEqual(409, e.statusCode);
            }
            AmwajOfferService.OfferRequest stale = AmwajSalesTestData.offer(dealId, unit.Id, planId);
            stale.expectedListPrice = AmwajSalesTestData.LIST_PRICE - 1;
            try {
                AmwajOfferService.createEoi(stale);
                Assert.fail('A changed price must stop the booking');
            } catch (AmwajSalesException e) {
                Assert.areEqual(409, e.statusCode);
            }
            AmwajOfferService.OfferRequest taken = AmwajSalesTestData.offer(dealId, unit.Id, planId);
            taken.customer.mobile = '07801234567'; // Nour Khaled's mobile
            try {
                AmwajOfferService.createEoi(taken);
                Assert.fail('Another customer\'s mobile must be refused');
            } catch (AmwajSalesException e) {
                Assert.areEqual(400, e.statusCode);
                Assert.isTrue(e.getMessage().contains('already has this mobile'), e.getMessage());
            }
            AmwajOfferService.OfferRequest ok = AmwajSalesTestData.offer(dealId, unit.Id, planId);
            ok.customer.mobile = '07709998884';
            ok.expectedListPrice = AmwajSalesTestData.LIST_PRICE;
            // The rep comes back through the lead: it resolves to the same deal instead of converting again.
            Assert.areEqual(dealId, AmwajLeadConversionService.review(l.Id).get('dealId'));
            eoi = AmwajOfferService.createEoi(ok);
        }
        Test.stopTest();

        Assert.areEqual(1, [SELECT COUNT() FROM Opportunity WHERE Account.LastName = 'Booker']);
        Assert.areEqual(1, [SELECT COUNT() FROM EOI__c WHERE LinkedOpportunity__c = :dealId]);
        EOI__c e = [SELECT Lead__c, Inventory__r.Status__c, ExpiryDate__c FROM EOI__c WHERE Id = :(Id) eoi.get('eoiId')];
        Assert.areEqual(l.Id, e.Lead__c, 'Lead attribution carried from the converted deal');
        Assert.areEqual('Held', e.Inventory__r.Status__c);
        Assert.areEqual(dealId, eoi.get('dealId'));
        Assert.isNotNull(eoi.get('customerName'));
        Assert.areEqual('Workspace 10/90', eoi.get('paymentPlanName'));
        Assert.areEqual('ATTACH_SIGNED_EOI', eoi.get('nextStep'));
        Assert.isTrue(((String) eoi.get('recordUrl')).endsWith('/lightning/r/EOI__c/' + e.Id + '/view'));
        Assert.areEqual(
            [SELECT Project__c FROM Inventory__c WHERE Id = :unit.Id].Project__c,
            [SELECT Project__c FROM Opportunity WHERE Id = :dealId].Project__c
        );
    }

    @IsTest
    static void aNewCustomerCannotReuseAnExistingCustomersMobile() {
        User rep1 = AmwajSalesTestData.rep('rep1');
        Opportunity deal = AmwajSalesTestData.deal('Hassan'); // mobile 07701234567
        // International form of the same number: only the org's normalised key matches it.
        Lead l = newLead('Twin', '+9647701234567', 'Individual', rep1.Id);
        Map<String, Object> review;
        Test.startTest();
        System.runAs(rep1) {
            review = AmwajLeadConversionService.review(l.Id);
            try {
                AmwajLeadConversionService.convert(l.Id, request('Twin', '+9647701234567'));
                Assert.fail('The org keeps one customer per mobile');
            } catch (AmwajSalesException e) {
                Assert.areEqual(AmwajLeadConversionService.DUPLICATE_CUSTOMER, e.getMessage());
            }
        }
        Test.stopTest();
        Map<String, Object> match = (Map<String, Object>) ((List<Object>) review.get('matches'))[0];
        Assert.areEqual(deal.AccountId, match.get('id'));
        Assert.areEqual(true, match.get('blocksNewCustomer'));
        Assert.isFalse([SELECT IsConverted FROM Lead WHERE Id = :l.Id].IsConverted, 'Nothing is kept from a failed conversion');
    }

    @IsTest
    static void mobilesAreCanonicalisedLikeTheAccountFlow() {
        Assert.areEqual('+9647701234567', AmwajLeadConversionService.canonicalMobile('07701234567'));
        Assert.areEqual('+9647701234567', AmwajLeadConversionService.canonicalMobile('009647701234567'));
        Assert.areEqual('+9647701234567', AmwajLeadConversionService.canonicalMobile('+9647701234567'));
        Assert.isNull(AmwajLeadConversionService.canonicalMobile('7701234567'));
    }

    @IsTest
    static void individualPlaceholderIsRecognised() {
        Assert.isTrue(AmwajLeadConversionService.isIndividual(null));
        Assert.isTrue(AmwajLeadConversionService.isIndividual(' individual '));
        Assert.isFalse(AmwajLeadConversionService.isIndividual('Acme Trading'));
    }
}
