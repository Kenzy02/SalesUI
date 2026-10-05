/**
 * Test data for the Amwaj sales workspace tests. Builds records that satisfy
 * the org's validation rules and record-triggered flows, so tests exercise the
 * real automation (unit holds, EOI expiry, reservation hold days).
 *
 * Two sales executives share one role, so neither can see the other's
 * private records (Lead, Opportunity, EOI are Private in the org).
 */
@IsTest
public class AmwajSalesTestData {
    public static final Decimal LIST_PRICE = 400000;
    public static final Decimal EOI_PERIOD_DAYS = 3;
    public static final Decimal HOLD_DAYS = 14;

    public static void createBaseline() {
        insert new PackageSettings__c(
            SetupOwnerId = UserInfo.getOrganizationId(),
            EOI_Period_Days__c = EOI_PERIOD_DAYS,
            DefaultHoldDays__c = HOLD_DAYS
        );

        Project__c proj = new Project__c(Name = 'Workspace Test Project', ProjectCode__c = 'AWTP', Status__c = 'Selling');
        Project__c closedProj = new Project__c(Name = 'Workspace Prelaunch Project', ProjectCode__c = 'AWTX', Status__c = 'PreLaunch');
        insert new List<Project__c>{ proj, closedProj };
        Building__c bldg = new Building__c(Name = 'Tower 1', Project__c = proj.Id);
        insert bldg;

        List<Inventory__c> units = new List<Inventory__c>();
        for (Integer i = 1; i <= 3; i++) {
            units.add(unit('AW-U-00' + i, proj.Id, bldg.Id, 'Available'));
        }
        units.add(unit('AW-U-SOLD', proj.Id, bldg.Id, 'Sold'));
        units.add(unit('AW-X-001', closedProj.Id, null, 'Available'));
        insert units;

        // Price lists after units, then one item per unit (org rule: one active list per
        // project, one item per unit). Unit_Price__c matches so the org's inventory flow
        // that re-syncs the item price leaves it unchanged.
        PriceList__c pl = new PriceList__c(
            Name = 'Workspace Prices', Project__c = proj.Id, EffectiveFrom__c = Date.today().addMonths(-1), IsActive__c = true
        );
        PriceList__c plx = new PriceList__c(
            Name = 'Prelaunch Prices', Project__c = closedProj.Id, EffectiveFrom__c = Date.today().addMonths(-1), IsActive__c = true
        );
        insert new List<PriceList__c>{ pl, plx };
        List<PriceListItem__c> items = new List<PriceListItem__c>();
        for (Inventory__c u : units) {
            items.add(
                new PriceListItem__c(
                    PriceList__c = u.Project__c == proj.Id ? pl.Id : plx.Id,
                    Inventory__c = u.Id,
                    List_Price_2__c = LIST_PRICE,
                    IsActive__c = true
                )
            );
        }
        insert items;

        PaymentPlan__c plan = new PaymentPlan__c(
            Name = 'Workspace 10/90', PlanCode__c = 'AW-1090', Project__c = proj.Id, DurationYears__c = 3,
            InstallmentFrequency__c = 'Annual', EffectiveFrom__c = Date.today().addMonths(-1), IsActive__c = false
        );
        PaymentPlan__c otherPlan = new PaymentPlan__c(
            Name = 'Prelaunch Plan', PlanCode__c = 'AW-X', Project__c = closedProj.Id, DurationYears__c = 1,
            InstallmentFrequency__c = 'Annual', EffectiveFrom__c = Date.today().addMonths(-1), IsActive__c = false
        );
        insert new List<PaymentPlan__c>{ plan, otherPlan };
        insert new List<PaymentPlanInstallment__c>{
            new PaymentPlanInstallment__c(PaymentPlan__c = plan.Id, Sequence__c = 1, InstallmentType__c = 'DownPayment', Percentage__c = 0.10),
            new PaymentPlanInstallment__c(PaymentPlan__c = plan.Id, Sequence__c = 2, InstallmentType__c = 'RecurringInstallment', Percentage__c = 0.90),
            new PaymentPlanInstallment__c(PaymentPlan__c = otherPlan.Id, Sequence__c = 1, InstallmentType__c = 'DownPayment', Percentage__c = 1.0)
        };
        plan.IsActive__c = true;
        otherPlan.IsActive__c = true;
        update new List<PaymentPlan__c>{ plan, otherPlan };

        User rep1 = salesExec('rep1');
        User rep2 = salesExec('rep2');
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insert new List<User>{ rep1, rep2 };
            List<PermissionSetAssignment> psas = new List<PermissionSetAssignment>();
            for (PermissionSet ps : [SELECT Id FROM PermissionSet WHERE Name IN ('Amwaj_SalesExec_PS', 'SalesUI_Access')]) {
                psas.add(new PermissionSetAssignment(AssigneeId = rep1.Id, PermissionSetId = ps.Id));
                psas.add(new PermissionSetAssignment(AssigneeId = rep2.Id, PermissionSetId = ps.Id));
            }
            insert psas;
        }

        Id personRt = Schema.SObjectType.Account.getRecordTypeInfosByDeveloperName().get('PersonAccount').getRecordTypeId();
        Account c1 = new Account(RecordTypeId = personRt, FirstName = 'Omar', LastName = 'Hassan', PersonMobilePhone = '07701234567');
        Account c2 = new Account(RecordTypeId = personRt, FirstName = 'Nour', LastName = 'Khaled', PersonMobilePhone = '07801234567');
        insert new List<Account>{ c1, c2 };
        insert new List<Opportunity>{
            new Opportunity(Name = 'Deal 1', StageName = 'Working', CloseDate = Date.today().addMonths(1), AccountId = c1.Id, Project__c = proj.Id, OwnerId = rep1.Id),
            new Opportunity(Name = 'Deal 2', StageName = 'Working', CloseDate = Date.today().addMonths(1), AccountId = c2.Id, Project__c = proj.Id, OwnerId = rep2.Id)
        };
        insert new List<Lead>{
            new Lead(FirstName = 'Mariam', LastName = 'Adel', Company = 'Individual', Status = 'New', MobilePhone = '07901234567', OwnerId = rep1.Id, Assigned__c = true),
            new Lead(FirstName = 'Sara', LastName = 'Ali', Company = 'Individual', Status = 'New', MobilePhone = '07501234567', OwnerId = rep2.Id, Assigned__c = true)
        };
    }

    private static Inventory__c unit(String name, Id projectId, Id buildingId, String status) {
        return new Inventory__c(
            Name = name, Project__c = projectId, Building__c = buildingId, Status__c = status,
            Unit_Type__c = 'Apartment', Bedrooms__c = 3, BuiltUpArea_SQM__c = 150, Unit_Price__c = LIST_PRICE
        );
    }

    private static User salesExec(String alias) {
        Profile p = [SELECT Id FROM Profile WHERE Name = 'Amwaj User' LIMIT 1];
        UserRole r = [SELECT Id FROM UserRole WHERE DeveloperName = 'Sales_Exec_Iraq_Gate' LIMIT 1];
        String unique = alias + '.' + String.valueOf(Crypto.getRandomInteger()).replace('-', '') + '@amwaj-salesui.test';
        return new User(
            ProfileId = p.Id, UserRoleId = r.Id, Username = unique, Email = alias + '@amwaj-salesui.test',
            LastName = alias, FirstName = 'Test', Alias = alias, TimeZoneSidKey = 'Asia/Baghdad', LocaleSidKey = 'en_IE',
            EmailEncodingKey = 'UTF-8', LanguageLocaleKey = 'en_US'
        );
    }

    // ---- lookups used by the tests ----

    public static User rep(String alias) {
        return [SELECT Id FROM User WHERE Alias = :alias AND Email LIKE '%@amwaj-salesui.test' LIMIT 1];
    }

    /** Deals are renamed by the org's Opportunity flow, so find them by customer last name. */
    public static Opportunity deal(String customerLastName) {
        return [SELECT Id, AccountId, OwnerId FROM Opportunity WHERE Account.LastName = :customerLastName LIMIT 1];
    }

    public static Inventory__c unitNamed(String name) {
        return [SELECT Id, Status__c FROM Inventory__c WHERE Name = :name LIMIT 1];
    }

    public static PaymentPlan__c plan(String code) {
        return [SELECT Id FROM PaymentPlan__c WHERE PlanCode__c = :code LIMIT 1];
    }

    public static AmwajOfferService.OfferRequest offer(Id dealId, Id unitId, Id planId) {
        AmwajOfferService.OfferRequest req = new AmwajOfferService.OfferRequest();
        req.dealId = dealId;
        req.unitId = unitId;
        req.paymentPlanId = planId;
        req.discountPct = 0;
        req.paymentMethod = 'Installments';
        req.customer = customer();
        return req;
    }

    public static AmwajOfferService.CustomerDetails customer() {
        AmwajOfferService.CustomerDetails c = new AmwajOfferService.CustomerDetails();
        c.fullNameArabic = 'عمر حسن';
        c.mobile = '07701234567';
        c.nationalId = '199012345678';
        c.nationalIdDate = Date.today().addYears(-2);
        c.city = 'Baghdad';
        c.district = 'Karrada';
        c.neighborhood = '905';
        c.alley = '12';
        c.houseNumber = '7';
        return c;
    }

    /** What finance does in Salesforce: signed document filed and payment verified (EOI -> Paid). */
    public static void financeConfirmsEoi(Id eoiId) {
        update new EOI__c(Id = eoiId, EOI_Document_Attached__c = true, PaymentVerifiedByFinance__c = true);
    }
}
