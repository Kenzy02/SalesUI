/**
 * REST routing, error mapping, "my records" scoping and lead follow-up
 * actions, called the way the React app calls them.
 */
@IsTest
private class AmwajSalesApiTest {
    @TestSetup
    static void setup() {
        AmwajSalesTestData.createBaseline();
    }

    private static Map<String, Object> call(String method, String path, Object body) {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/amwaj/sales/v1/' + path.substringBefore('?');
        req.httpMethod = method;
        if (path.contains('?')) {
            for (String pair : path.substringAfter('?').split('&')) {
                req.addParameter(pair.substringBefore('='), EncodingUtil.urlDecode(pair.substringAfter('='), 'UTF-8'));
            }
        }
        if (body != null) {
            req.requestBody = Blob.valueOf(JSON.serialize(body));
        }
        RestContext.request = req;
        RestContext.response = new RestResponse();
        if (method == 'GET') {
            AmwajSalesApi.doGet();
        } else if (method == 'POST') {
            AmwajSalesApi.doPost();
        } else {
            AmwajSalesApi.doPatch();
        }
        Map<String, Object> out = (Map<String, Object>) JSON.deserializeUntyped(RestContext.response.responseBody.toString());
        out.put('_status', RestContext.response.statusCode);
        return out;
    }

    private static Decimal dec(Object v) {
        return v == null ? null : Decimal.valueOf(String.valueOf(v));
    }

    private static List<Object> items(Map<String, Object> m, String key) {
        return (List<Object>) m.get(key);
    }

    @IsTest
    static void myLeadsAreScopedToTheSessionUser() {
        Lead rep2Lead = [SELECT Id FROM Lead WHERE LastName = 'Ali'];
        Test.startTest();
        System.runAs(AmwajSalesTestData.rep('rep1')) {
            Map<String, Object> leads = call('GET', 'leads', null);
            Assert.areEqual(200, leads.get('_status'), '' + leads.get('error'));
            Assert.areEqual(1, items(leads, 'leads').size(), 'Only the rep\'s own lead');
            Assert.areEqual('Mariam Adel', ((Map<String, Object>) items(leads, 'leads')[0]).get('name'));

            Assert.areEqual(1, items(call('GET', 'leads?search=Mariam', null), 'leads').size());
            Assert.areEqual(0, items(call('GET', 'leads?status=Working', null), 'leads').size());

            Map<String, Object> other = call('GET', 'leads/' + rep2Lead.Id, null);
            Assert.areEqual(404, other.get('_status'), 'A peer\'s private lead is not visible');
            Assert.isNotNull(other.get('error'));

            Map<String, Object> me = call('GET', 'me', null);
            Assert.areEqual(String.valueOf(UserInfo.getUserId()), me.get('userId'));
            Assert.areEqual(AmwajSalesTestData.HOLD_DAYS, dec(me.get('reservationHoldDays')));
        }
        Test.stopTest();
    }

    @IsTest
    static void leadStatusUpdateAndFollowUpsAsRep() {
        Lead mine = [SELECT Id FROM Lead WHERE LastName = 'Adel'];
        Lead peers = [SELECT Id FROM Lead WHERE LastName = 'Ali'];
        Test.startTest();
        System.runAs(AmwajSalesTestData.rep('rep1')) {
            Map<String, Object> updated = call('PATCH', 'leads/' + mine.Id, new Map<String, Object>{ 'status' => 'Working' });
            Assert.areEqual(200, updated.get('_status'), '' + updated.get('error'));
            Assert.areEqual('Working', updated.get('status'));
            Assert.areEqual(1, call('GET', 'overview', null).get('openLeads'));

            // SalesUI_Access grants the Task fields (WhoId, WhatId, ActivityDate, Description).
            Assert.areEqual(true, call('GET', 'me', null).get('activitiesEnabled'));
            Map<String, Object> logged = call(
                'POST',
                'leads/' + mine.Id + '/activities',
                new Map<String, Object>{ 'kind' => 'FOLLOW_UP', 'subject' => 'Site visit', 'dueDate' => Date.today().addDays(1) }
            );
            Assert.areEqual(200, logged.get('_status'), '' + logged.get('error'));
            Assert.areEqual(1, items(call('GET', 'overview', null), 'followUps').size());

            // Peers' leads stay out of reach for activities too.
            Assert.areNotEqual(200, call('POST', 'leads/' + peers.Id + '/activities', new Map<String, Object>{ 'kind' => 'CALL', 'subject' => 'x' }).get('_status'));
        }
        Test.stopTest();
    }

    @IsTest
    static void leadFollowUpActivitiesForUsersWithTaskAccess() {
        // Runs as the admin executing the test, who has full Task field access.
        Lead mine = [SELECT Id FROM Lead WHERE LastName = 'Adel'];
        Test.startTest();
        Map<String, Object> callLogged = call(
            'POST',
            'leads/' + mine.Id + '/activities',
            new Map<String, Object>{ 'kind' => 'CALL', 'subject' => 'Intro call', 'comments' => 'Wants 3 bedrooms' }
        );
        Assert.areEqual(200, callLogged.get('_status'), '' + callLogged.get('error'));

        Map<String, Object> missingDate = call(
            'POST',
            'leads/' + mine.Id + '/activities',
            new Map<String, Object>{ 'kind' => 'FOLLOW_UP', 'subject' => 'Site visit' }
        );
        Assert.areEqual(400, missingDate.get('_status'));

        call(
            'POST',
            'leads/' + mine.Id + '/activities',
            new Map<String, Object>{ 'kind' => 'FOLLOW_UP', 'subject' => 'Site visit', 'dueDate' => Date.today().addDays(2) }
        );
        Map<String, Object> detail = call('GET', 'leads/' + mine.Id, null);
        Assert.areEqual(2, items(detail, 'activities').size());
        Assert.areEqual(true, detail.get('canEdit'));

        Task open = [SELECT Id FROM Task WHERE WhoId = :mine.Id AND IsClosed = false];
        Assert.areEqual(200, call('POST', 'activities/' + open.Id + '/complete', null).get('_status'));
        Test.stopTest();
        Assert.areEqual(0, [SELECT COUNT() FROM Task WHERE WhoId = :mine.Id AND IsClosed = false]);
    }

    @IsTest
    static void unitsAndOfferJourneyThroughTheApi() {
        Opportunity deal = AmwajSalesTestData.deal('Hassan');
        Test.startTest();
        System.runAs(AmwajSalesTestData.rep('rep1')) {
            Map<String, Object> facets = call('GET', 'units/facets', null);
            Assert.isFalse(items(facets, 'projects').isEmpty());
            Id projectId = [SELECT Id FROM Project__c WHERE ProjectCode__c = 'AWTP'].Id;
            Boolean apartmentInProject = false;
            for (Object o : items(facets, 'typesByProject')) {
                Map<String, Object> t = (Map<String, Object>) o;
                if (t.get('projectId') == String.valueOf(projectId) && t.get('unitType') == 'Apartment') {
                    apartmentInProject = true;
                    Assert.areEqual(3, t.get('available'), 'Three available apartments in the test project');
                }
            }
            Assert.isTrue(apartmentInProject, 'Unit types come from the project inventory');
            for (Object o : items(facets, 'projects')) {
                Map<String, Object> p = (Map<String, Object>) o;
                if (p.get('id') == String.valueOf(projectId)) {
                    Assert.areEqual(true, p.get('hasPaymentPlans'));
                }
            }
            Assert.areEqual(1, items(call('GET', 'deals?projectId=' + projectId, null), 'deals').size());
            Assert.areEqual(0, items(call('GET', 'leads?projectId=' + projectId, null), 'leads').size(), 'Test leads record no project interest');
            Assert.areEqual(3, call('GET', 'units?projectId=' + projectId + '&unitType=Apartment&status=Available', null).get('total'));

            Map<String, Object> units = call('GET', 'units?status=Available&search=AW-U&minBedrooms=2', null);
            Assert.areEqual(3, units.get('total'));

            Map<String, Object> firstUnit = (Map<String, Object>) items(units, 'units')[0];
            Map<String, Object> detail = call('GET', 'units/' + firstUnit.get('id'), null);
            Map<String, Object> pricing = (Map<String, Object>) detail.get('pricing');
            Assert.areEqual(1, ((List<Object>) pricing.get('plans')).size(), 'Plan eligibility from PaymentPlanViewerController');
            Assert.isTrue(items(detail, 'media').isEmpty(), 'No media in test data');

            Map<String, Object> plan = (Map<String, Object>) ((List<Object>) pricing.get('plans'))[0];
            Map<String, Object> offer = new Map<String, Object>{
                'dealId' => deal.Id,
                'unitId' => firstUnit.get('id'),
                'paymentPlanId' => plan.get('id'),
                'discountPct' => 0,
                'paymentMethod' => 'Installments',
                'customer' => JSON.deserializeUntyped(JSON.serialize(AmwajSalesTestData.customer()))
            };
            Map<String, Object> created = call('POST', 'eois', offer);
            Assert.areEqual(200, created.get('_status'), '' + created.get('error'));
            Assert.areEqual('Held', created.get('unitStatus'));

            Map<String, Object> eois = call('GET', 'eois', null);
            Assert.areEqual(1, items(eois, 'eois').size());
            Map<String, Object> eoi = (Map<String, Object>) items(eois, 'eois')[0];
            Assert.areEqual('ATTACH_SIGNED_EOI', eoi.get('nextStep'));

            Map<String, Object> again = call('POST', 'eois', offer);
            Assert.areEqual(true, again.get('replayed'));

            Map<String, Object> dealDetail = call('GET', 'deals/' + deal.Id, null);
            Assert.areEqual(200, dealDetail.get('_status'), '' + dealDetail.get('error'));
            Assert.areEqual(1, items(dealDetail, 'eois').size());
            Map<String, Object> customer = (Map<String, Object>) dealDetail.get('customer');
            Assert.areEqual('Baghdad', customer.get('city'));
            Assert.areEqual('199012345678', customer.get('nationalId'), 'Written in system mode, as the org flow does; readable by reps');

            Map<String, Object> overview = call('GET', 'overview', null);
            Assert.areEqual(1, items(overview, 'holds').size());

            Map<String, Object> commission = call('GET', 'commission', null);
            Assert.areEqual(200, commission.get('_status'));
            Assert.areEqual(0, dec(commission.get('commission')), 'Not signed, nothing confirmed yet');

            Map<String, Object> customers = call('GET', 'customers', null);
            Assert.areEqual(200, customers.get('_status'), '' + customers.get('error'));
            Assert.areEqual(1, items(customers, 'customers').size());
            Map<String, Object> card = (Map<String, Object>) items(customers, 'customers')[0];
            Assert.areEqual(1, ((Map<String, Object>) card.get('counts')).get('eoiHold'));
            Map<String, Object> pay = (Map<String, Object>) card.get('payments');
            Assert.areEqual(0, dec(pay.get('confirmedPaid')), 'Fee requested, not confirmed by finance');
            Assert.areEqual(AmwajSalesTestData.LIST_PRICE * 0.015, dec(pay.get('pendingConfirmation')));
            Assert.areEqual(200, call('GET', 'customers/' + deal.AccountId, null).get('_status'));
            Assert.areEqual(400, call('GET', 'customers?projectId=not-an-id', null).get('_status'));
            Assert.areEqual(400, call('GET', 'customers/not-an-id', null).get('_status'));

            Map<String, Object> reservations = call('GET', 'reservations', null);
            Assert.areEqual(200, reservations.get('_status'), '' + reservations.get('error'));
            Assert.isTrue(items(reservations, 'reservations').isEmpty(), 'EOI only, no reservation yet');
        }
        Test.stopTest();
    }

    @IsTest
    static void fullJourneyThroughTheApiAsAUserWithEoiAccess() {
        // As the admin running the test (edit access to EOIs, as finance / contracts have).
        Opportunity deal = AmwajSalesTestData.deal('Hassan');
        Lead lead = [SELECT Id FROM Lead WHERE LastName = 'Adel'];
        Id unitId = AmwajSalesTestData.unitNamed('AW-U-002').Id;
        Test.startTest();
        Assert.areEqual(200, call('GET', 'deals?search=Hassan', null).get('_status'));
        Assert.areEqual(400, call('PATCH', 'leads/' + lead.Id, new Map<String, Object>()).get('_status'), 'Nothing to update');
        Map<String, Object> edited = call(
            'PATCH',
            'leads/' + lead.Id,
            new Map<String, Object>{ 'rating' => 'Hot', 'description' => 'Prefers a garden view' }
        );
        Assert.areEqual(200, edited.get('_status'), '' + edited.get('error'));
        Assert.areEqual('Hot', edited.get('rating'));
        Assert.areEqual(
            400,
            call('POST', 'leads/' + lead.Id + '/activities', new Map<String, Object>{ 'kind' => 'EMAIL', 'subject' => 'x' }).get('_status')
        );
        Assert.areEqual(
            400,
            call('POST', 'deals/' + deal.AccountId + '/activities', new Map<String, Object>{ 'kind' => 'CALL', 'subject' => 'x' })
                .get('_status'),
            'Activities belong on leads and deals'
        );
        Assert.areEqual(
            200,
            call('POST', 'deals/' + deal.Id + '/activities', new Map<String, Object>{ 'kind' => 'CALL', 'subject' => 'Site visit done' })
                .get('_status')
        );

        Map<String, Object> offer = new Map<String, Object>{
            'dealId' => deal.Id,
            'unitId' => unitId,
            'paymentPlanId' => AmwajSalesTestData.plan('AW-1090').Id,
            'paymentMethod' => 'Cash',
            'customer' => JSON.deserializeUntyped(JSON.serialize(AmwajSalesTestData.customer()))
        };
        Map<String, Object> created = call('POST', 'eois', offer);
        Assert.areEqual(200, created.get('_status'), '' + created.get('error'));
        String eoiId = (String) created.get('eoiId');
        Map<String, Object> doc = call(
            'POST',
            'eois/' + eoiId + '/document',
            new Map<String, Object>{ 'fileName' => 'Signed.pdf', 'base64' => EncodingUtil.base64Encode(Blob.valueOf('%PDF')) }
        );
        Assert.areEqual(200, doc.get('_status'), '' + doc.get('error'));
        Assert.areEqual('AWAITING_FINANCE', call('GET', 'eois/' + eoiId, null).get('nextStep'));

        update new EOI__c(Id = eoiId, PaymentVerifiedByFinance__c = true);
        Map<String, Object> res = call('POST', 'reservations', new Map<String, Object>{ 'eoiId' => eoiId, 'depositAmount' => 25000 });
        Assert.areEqual(200, res.get('_status'), '' + res.get('error'));
        Assert.areEqual(25000, dec(res.get('deposit')), 'Cash buyers: the deposit entered by the sales user');
        Assert.areEqual('RESERVED', call('GET', 'eois/' + eoiId, null).get('nextStep'));

        List<Object> reservations = items(call('GET', 'reservations', null), 'reservations');
        Assert.areEqual(1, reservations.size());
        Map<String, Object> row = (Map<String, Object>) reservations[0];
        Assert.areEqual(res.get('name'), row.get('name'));
        Assert.areEqual(eoiId, row.get('eoiId'));
        Assert.areEqual(25000, dec(row.get('deposit')));
        Assert.isNotNull(row.get('customerName'));
        Assert.isFalse(row.containsKey('dealAccountName'));
        System.runAs(AmwajSalesTestData.rep('rep2')) {
            Assert.isTrue(items(call('GET', 'reservations', null), 'reservations').isEmpty(), 'Not shared with another rep');
        }
        Test.stopTest();
    }

    @IsTest
    static void malformedRequestsAreRejected() {
        RestRequest req = new RestRequest();
        req.requestURI = '/services/apexrest/amwaj/sales/v1/eois';
        req.httpMethod = 'POST';
        req.requestBody = Blob.valueOf('not json');
        RestContext.request = req;
        RestContext.response = new RestResponse();
        AmwajSalesApi.doPost();
        Assert.areEqual(400, RestContext.response.statusCode);

        req.requestURI = '/services/apexrest/amwaj/sales/v1/eois/' + AmwajSalesTestData.deal('Hassan').Id + '/document';
        req.requestBody = Blob.valueOf('[1, 2]');
        RestContext.response = new RestResponse();
        AmwajSalesApi.doPost();
        Assert.areEqual(500, RestContext.response.statusCode, 'Unexpected shapes are reported, not thrown');
    }

    @IsTest
    static void errorsAreMappedToStatusCodes() {
        Test.startTest();
        System.runAs(AmwajSalesTestData.rep('rep1')) {
            Assert.areEqual(404, call('GET', 'nope', null).get('_status'));
            Assert.areEqual(400, call('GET', 'leads/not-an-id', null).get('_status'));
            Assert.areEqual(400, call('POST', 'eois', null).get('_status'));
            Assert.areEqual(400, call('GET', 'units?minPrice=abc', null).get('_status'));
            Map<String, Object> missing = call('GET', 'files/068000000000000', null);
            Assert.areEqual(404, missing.get('_status'));
        }
        Test.stopTest();
    }

    /**
     * REST calls in these tests bypass the Apex class-access check, so assert the
     * grant itself: sales users reach AmwajSalesApi only through SalesUI_Access.
     */
    @IsTest
    static void salesUiAccessGrantsTheApiClass() {
        Assert.areEqual(
            1,
            [
                SELECT COUNT()
                FROM SetupEntityAccess
                WHERE Parent.Name = 'SalesUI_Access'
                    AND SetupEntityId IN (SELECT Id FROM ApexClass WHERE Name = 'AmwajSalesApi')
            ],
            'SalesUI_Access must grant the AmwajSalesApi class'
        );
    }

    @IsTest
    static void pathParsing() {
        Assert.areEqual(
            new List<String>{ 'leads', 'abc', 'activities' },
            AmwajSalesApi.segments('/services/apexrest/amwaj/sales/v1/leads/abc/activities/?x=1')
        );
        Assert.areEqual(new List<String>(), AmwajSalesApi.segments('/services/apexrest/other'));
        Assert.isTrue(AmwajMediaService.isFloorPlan('Unit A1 - Floor Plan'));
        Assert.isTrue(AmwajMediaService.isFloorPlan('a1_floorplan'));
        Assert.isFalse(AmwajMediaService.isFloorPlan('Living room'));
        Assert.areEqual('image/jpeg', AmwajMediaService.mimeType('JPG'));
        Assert.areEqual('application/pdf', AmwajMediaService.mimeType('pdf'));
    }
}
