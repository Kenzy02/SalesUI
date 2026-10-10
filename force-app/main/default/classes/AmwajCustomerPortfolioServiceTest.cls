/**
 * Customer portfolio and per-unit commission, end to end through the org's
 * flows, as sales users: one customer with a sold unit, a reserved unit and a
 * unit held by EOI; another rep sees none of it.
 */
@IsTest
private class AmwajCustomerPortfolioServiceTest {
    private static final Decimal FEE = AmwajSalesTestData.LIST_PRICE * 0.015;
    private static final Decimal DOWN_PAYMENT = AmwajSalesTestData.LIST_PRICE * 0.10;

    @TestSetup
    static void setup() {
        AmwajSalesTestData.createBaseline();
        Opportunity first = AmwajSalesTestData.deal('Hassan');
        // Two more deals for the same customer, owned by the same rep (one EOI per deal in the org's process).
        insert new List<Opportunity>{
            new Opportunity(Name = 'Deal 1b', StageName = 'Working', CloseDate = Date.today().addMonths(1), AccountId = first.AccountId, OwnerId = first.OwnerId),
            new Opportunity(Name = 'Deal 1c', StageName = 'Working', CloseDate = Date.today().addMonths(1), AccountId = first.AccountId, OwnerId = first.OwnerId)
        };
    }

    private static List<Opportunity> hassanDeals() {
        return [SELECT Id, AccountId FROM Opportunity WHERE Account.LastName = 'Hassan' ORDER BY CreatedDate, Id];
    }

    /**
     * Sold (A), reserved with the deposit awaiting finance (B), held by EOI with the fee awaiting
     * finance (C), all owned by rep1 as the app would create them. Records go in with one DML per
     * step so the org's flows run once per step (the API paths are covered by AmwajOfferServiceTest).
     */
    private static Map<String, Id> buildPortfolio() {
        User rep1 = AmwajSalesTestData.rep('rep1');
        List<Opportunity> deals = hassanDeals();
        Id planId = AmwajSalesTestData.plan('AW-1090').Id;
        List<String> keys = new List<String>{ 'A', 'B', 'C' };
        Map<String, Inventory__c> units = new Map<String, Inventory__c>();
        Map<Id, Id> priceItemByUnit = new Map<Id, Id>();
        for (Inventory__c u : [SELECT Id, Name, Project__c FROM Inventory__c WHERE Name IN ('AW-U-001', 'AW-U-002', 'AW-U-003')]) {
            units.put(u.Name.right(1).replace('1', 'A').replace('2', 'B').replace('3', 'C'), u);
        }
        for (PriceListItem__c item : [SELECT Id, Inventory__c FROM PriceListItem__c WHERE Inventory__c IN :new Map<Id, Inventory__c>(units.values()).keySet()]) {
            priceItemByUnit.put(item.Inventory__c, item.Id);
        }
        List<EOI__c> eois = new List<EOI__c>();
        for (Integer i = 0; i < 3; i++) {
            Inventory__c u = units.get(keys[i]);
            eois.add(new EOI__c(
                LinkedOpportunity__c = deals[i].Id, PersonAccount__c = deals[i].AccountId, Project__c = u.Project__c, Inventory__c = u.Id,
                Preferred_Payment_Plan__c = planId, Payment_Method__c = 'Installments', Discount__c = 0, Reservation_Fees__c = FEE,
                Status__c = 'Submitted', OwnerId = rep1.Id
            ));
        }
        insert eois;
        // Finance files the signed EOI and confirms the booking fee on A and B (EOI -> Paid).
        update new List<EOI__c>{
            new EOI__c(Id = eois[0].Id, EOI_Document_Attached__c = true, PaymentVerifiedByFinance__c = true),
            new EOI__c(Id = eois[1].Id, EOI_Document_Attached__c = true, PaymentVerifiedByFinance__c = true)
        };
        List<Reservation__c> res = new List<Reservation__c>();
        for (Integer i = 0; i < 2; i++) {
            Inventory__c u = units.get(keys[i]);
            res.add(new Reservation__c(
                EOI__c = eois[i].Id, Opportunity__c = deals[i].Id, PersonAccount__c = deals[i].AccountId, Inventory__c = u.Id,
                PriceListItem__c = priceItemByUnit.get(u.Id), PaymentPlan__c = planId, Discount__c = 0, DepositAmount__c = DOWN_PAYMENT,
                Status__c = 'Submitted', OwnerId = rep1.Id
            ));
        }
        insert res;
        // Finance confirms A's deposit, then the contract document is filed: the org's flows make it Active (sold).
        update new Reservation__c(Id = res[0].Id, DepositVerified__c = true);
        update new Reservation__c(Id = res[0].Id, Reservation_Document_Attached__c = true);
        return new Map<String, Id>{ 'eoiA' => eois[0].Id, 'eoiB' => eois[1].Id, 'eoiC' => eois[2].Id, 'resA' => res[0].Id, 'resB' => res[1].Id };
    }

    @IsTest
    static void oneCardPerCustomerWithUnitsByStatusAndConfirmedMoney() {
        Map<String, Id> ids = buildPortfolio();
        Assert.areEqual('Active', [SELECT Status__c FROM Reservation__c WHERE Id = :ids.get('resA')].Status__c, 'Org flows sold unit A');
        Id accountId = hassanDeals()[0].AccountId;

        Map<String, Object> list1;
        Map<String, Object> detail;
        Map<String, Object> otherRep;
        Map<String, Object> filtered;
        Test.startTest();
        System.runAs(AmwajSalesTestData.rep('rep1')) {
            list1 = AmwajCustomerPortfolioService.customers(null, null);
            filtered = AmwajCustomerPortfolioService.customers('nobody-matches', null);
            detail = AmwajCustomerPortfolioService.customer(accountId);
        }
        System.runAs(AmwajSalesTestData.rep('rep2')) {
            otherRep = AmwajCustomerPortfolioService.customers(null, null);
            try {
                AmwajCustomerPortfolioService.customer(accountId);
                Assert.fail('rep2 shares none of this customer\'s deals');
            } catch (AmwajSalesException e) {
                Assert.areEqual(404, e.statusCode);
            }
        }
        Test.stopTest();

        List<Object> cards = (List<Object>) list1.get('customers');
        Assert.areEqual(1, cards.size(), 'Three deals for one customer make one card');
        Map<String, Object> card = (Map<String, Object>) cards[0];
        Assert.areEqual(accountId, card.get('id'));
        Map<String, Object> counts = (Map<String, Object>) card.get('counts');
        Assert.areEqual(1, counts.get('sold'));
        Assert.areEqual(1, counts.get('reserved'));
        Assert.areEqual(1, counts.get('eoiHold'));
        Assert.areEqual(3, counts.get('deals'));

        Map<String, Object> pay = (Map<String, Object>) card.get('payments');
        Assert.areEqual(FEE * 2 + DOWN_PAYMENT, pay.get('confirmedPaid'), 'A and B fees + A deposit');
        Assert.areEqual(DOWN_PAYMENT + FEE, pay.get('pendingConfirmation'), 'B deposit + C fee wait for finance');
        Assert.areEqual(AmwajSalesTestData.LIST_PRICE * 2, pay.get('propertyPrice'), 'Sold + reserved units');
        Assert.areEqual(DOWN_PAYMENT, pay.get('confirmedTowardPrice'), 'Booking fees are additional, not part of the price');
        Assert.isNull(pay.get('remainingPayable'), 'No instalment receipts are recorded: not invented');
        Assert.isNull(pay.get('overdue'), 'No due dates are recorded');
        Assert.areEqual(false, pay.get('installmentsRecorded'));

        List<Object> units = (List<Object>) card.get('units');
        Assert.areEqual('SOLD', ((Map<String, Object>) units[0]).get('saleStatus'), 'Sold first');
        Assert.areEqual('EOI_HOLD', ((Map<String, Object>) units[2]).get('saleStatus'));

        Map<String, Object> totals = (Map<String, Object>) list1.get('totals');
        Assert.areEqual(1, totals.get('customers'));
        Assert.areEqual(1, totals.get('sold'));
        Assert.areEqual(0, ((List<Object>) filtered.get('customers')).size());
        List<Object> otherCards = (List<Object>) otherRep.get('customers');
        Assert.areEqual(1, otherCards.size(), 'rep2 sees only their own customer');
        Assert.areNotEqual(accountId, ((Map<String, Object>) otherCards[0]).get('id'), 'Another rep never gets this customer\'s card');
        Assert.areEqual(0, ((Map<String, Object>) ((Map<String, Object>) otherCards[0]).get('counts')).get('sold'));

        List<Object> detailUnits = (List<Object>) detail.get('units');
        Assert.areEqual(3, detailUnits.size());
        Map<String, Object> sold = (Map<String, Object>) detailUnits[0];
        Assert.areEqual(Date.today(), sold.get('saleDate'), 'Activation date stamped by the org');
        Assert.isNotNull(sold.get('eoi'));
        Assert.areEqual(1, ((List<Object>) sold.get('reservations')).size());
        Assert.areEqual(3, ((List<Object>) detail.get('deals')).size());
    }

    @IsTest
    static void commissionIsItemisedPerSoldUnitForTheDealOwner() {
        Map<String, Id> ids = buildPortfolio();
        AmwajCommissionService.rateOverride = 1;
        AmwajCommissionService.Result mine;
        AmwajCommissionService.Result theirs;
        Test.startTest();
        System.runAs(AmwajSalesTestData.rep('rep1')) {
            mine = AmwajCommissionService.forCurrentUser();
        }
        System.runAs(AmwajSalesTestData.rep('rep2')) {
            theirs = AmwajCommissionService.forCurrentUser();
        }
        Test.stopTest();

        Assert.areEqual(1, mine.soldUnits);
        AmwajCommissionService.Line soldLine;
        for (AmwajCommissionService.Line l : mine.lines) {
            if (l.saleStatus == 'SOLD') {
                soldLine = l;
            }
        }
        Assert.areEqual(ids.get('resA'), soldLine.reservationId);
        Assert.areEqual(AmwajSalesTestData.LIST_PRICE, soldLine.saleValue, 'Sale value read in the rep\'s own access');
        Assert.isTrue(soldLine.saleDetailsVisible);
        Assert.areEqual(Date.today(), soldLine.saleDate);
        Assert.areEqual(FEE + DOWN_PAYMENT, soldLine.eligibleBasis, 'Confirmed collections, not the full price');
        Assert.areEqual(((FEE + DOWN_PAYMENT) / 100).setScale(2), soldLine.commission);
        Assert.areEqual(soldLine.commission, mine.soldCommission);
        Assert.areEqual((FEE / 100).setScale(2), mine.notSoldCommission, 'B: signed, fee confirmed, not sold yet');
        Assert.areEqual(mine.commission, mine.soldCommission + mine.notSoldCommission);
        Assert.areEqual('PROPOSED_UNCONFIRMED', mine.rateStatus);
        Assert.areEqual(0, theirs.soldUnits);
        Assert.areEqual(0, theirs.lines.size());
    }
}
