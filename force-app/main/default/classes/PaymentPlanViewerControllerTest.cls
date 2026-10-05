/**
 * Unit tests for PaymentPlanViewerController (phase-1, self-contained).
 *
 * Covers: project-wide template pricing and totals, pre/post-handover
 * grouping, zone rules (multi-zone plan values matched by whole value, zoned
 * units see only matching zone plans of their own project, units without a
 * zone see only project-wide plans), misconfigured plans flagged per-plan
 * (not fatal), no-active-price behaviour, inactive/expired exclusion, totals
 * warning, fixed-amount rows, and the null-argument guard.
 *
 * Data respects the org validations: one active Price List per Project and
 * one Price List Item per Inventory.
 *
 * Org portability: some fields are REQUIRED in the sandbox (PriceList__c.
 * Currency__c, PaymentPlan__c.Currency__c / DeliveryOffsetMonths__c,
 * PaymentPlanInstallment__c.DueTrigger__c) but are not deployed to production
 * in this phase. They are set via putIfExists() so this class compiles and
 * its DML succeeds in both orgs without referencing the fields statically.
 */
@IsTest
private class PaymentPlanViewerControllerTest {
    @TestSetup
    static void setup() {
        Project__c proj = new Project__c(
            Name = 'Viewer Test Project',
            ProjectCode__c = 'VWTP'
        );
        insert proj;

        Building__c bldg = new Building__c(
            Name = 'Building 1',
            Project__c = proj.Id
        );
        insert bldg;

        Project__c otherProj = new Project__c(
            Name = 'Viewer Other Project',
            ProjectCode__c = 'VWTO'
        );
        insert otherProj;

        // Unit without a zone - sees only project-wide plans.
        Inventory__c unit = new Inventory__c(
            Name = 'VWT-U-001',
            Project__c = proj.Id,
            Building__c = bldg.Id,
            BuiltUpArea_SQM__c = 140,
            Status__c = 'Available'
        );
        // Zoned unit - sees only plans whose zone list contains 'in-c 4'.
        Inventory__c unitZoned = new Inventory__c(
            Name = 'VWT-U-002',
            Project__c = proj.Id,
            Building__c = bldg.Id,
            Zone__c = 'in-c 4',
            BuiltUpArea_SQM__c = 120,
            Status__c = 'Available'
        );
        // Zoned unit with no matching plan ('Zone 1' must not match 'Zone 11' / 'Zone 12').
        Inventory__c unitZone1 = new Inventory__c(
            Name = 'VWT-U-003',
            Project__c = proj.Id,
            Building__c = bldg.Id,
            Zone__c = 'Zone 1',
            BuiltUpArea_SQM__c = 110,
            Status__c = 'Available'
        );
        insert new List<Inventory__c>{ unit, unitZoned, unitZone1 };

        PriceList__c pl = priceList('Viewer Test Price List', proj.Id, Date.today().addMonths(-1));
        insert pl;

        PriceListItem__c pli = new PriceListItem__c(
            PriceList__c = pl.Id,
            Inventory__c = unit.Id,
            List_Price_2__c = 400000,
            IsActive__c = true
        );
        insert pli;

        // ---- Plans (staged activation: children first, then IsActive=true) ----

        // 1. Project-wide: 10% DP + 90% recurring.
        PaymentPlan__c planProject = plan('Project Standard', 'VWT-PROJ', proj.Id);
        // 2. Gardens-style: 50% pre-handover + 2 x 25% post-handover.
        PaymentPlan__c planGardens = plan('Gardens 3+2', 'VWT-GARD', proj.Id);
        // 3. Zone-scoped plans (Zone values from the Payment Plan Zone value set).
        PaymentPlan__c planZone11 = plan('Zone 11 Plan', 'VWT-Z11', proj.Id);
        planZone11.Zone__c = 'Zone 11';
        // 4. Zone-scoped to an unrelated zone.
        PaymentPlan__c planZone12 = plan('Zone 12 Plan', 'VWT-Z12', proj.Id);
        planZone12.Zone__c = 'Zone 12';
        // 4b. Multi-zone value that contains the zoned unit's 'in-c 4'.
        PaymentPlan__c planOut = plan('Out and In-C 4-5-6 Plan', 'VWT-OUT', proj.Id);
        planOut.Zone__c = 'out 4, out 5, out 6, in-c 4, in-c 5, in-c 6';
        // 4c. Multi-zone value with 'in 4' - must NOT match 'in-c 4'.
        PaymentPlan__c planIn456 = plan('In 4-5-6 Plan', 'VWT-IN4', proj.Id);
        planIn456.Zone__c = 'in 4, in 5, in 6';
        // 4d. Same matching zone but ANOTHER project - must never appear.
        PaymentPlan__c planOtherProject = plan('Other Project Out Plan', 'VWT-P2OUT', otherProj.Id);
        planOtherProject.Zone__c = 'out 4, out 5, out 6, in-c 4, in-c 5, in-c 6';
        // 5. Misconfigured: second row has neither Percentage nor FixedAmount.
        PaymentPlan__c planBad = plan('Misconfigured Plan', 'VWT-ZBAD', proj.Id);
        // 6. Inactive and 7. expired - both excluded from the viewer.
        PaymentPlan__c planInactive = plan('Inactive Plan', 'VWT-INAC', proj.Id);
        PaymentPlan__c planExpired = plan('Expired Plan', 'VWT-EXP', proj.Id);
        planExpired.EffectiveFrom__c = Date.today().addMonths(-12);
        planExpired.EffectiveTo__c = Date.today().addDays(-1);
        // 8. Pct-only plan not summing to 100% - totals warning.
        PaymentPlan__c planShort = plan('Short Plan', 'VWT-SHRT', proj.Id);
        // 9. Fixed-amount launch check + pct remainder - no totals warning.
        PaymentPlan__c planFixed = plan('Launch Check Plan', 'VWT-FIX', proj.Id);

        insert new List<PaymentPlan__c>{
            planProject, planGardens, planZone11, planZone12,
            planOut, planIn456, planOtherProject,
            planBad, planInactive, planExpired, planShort, planFixed
        };

        insert new List<PaymentPlanInstallment__c>{
            // planProject: DP 10% + recurring 90%
            inst(planProject.Id, 1, 'DownPayment', 0.10, null, 'Down Payment'),
            inst(planProject.Id, 2, 'RecurringInstallment', 0.90, null, 'Quarterly Installment'),
            // planGardens: 50% pre + 2 x 25% post-handover
            inst(planGardens.Id, 1, 'RecurringInstallment', 0.50, null, 'Annual Installment'),
            inst(planGardens.Id, 2, 'PostHandoverInstallment', 0.25, null, 'Post-Handover Year 1'),
            inst(planGardens.Id, 3, 'PostHandoverInstallment', 0.25, null, 'Post-Handover Year 2'),
            // single 100% rows for the scoping plans
            inst(planZone11.Id, 1, 'DownPayment', 1.0, null, null),
            inst(planZone12.Id, 1, 'DownPayment', 1.0, null, null),
            inst(planOut.Id, 1, 'DownPayment', 1.0, null, null),
            inst(planIn456.Id, 1, 'DownPayment', 1.0, null, null),
            inst(planOtherProject.Id, 1, 'DownPayment', 1.0, null, null),
            // planBad: valid row + row with neither pct nor fixed
            inst(planBad.Id, 1, 'DownPayment', 1.0, null, null),
            inst(planBad.Id, 2, 'SecondPayment', null, null, null),
            inst(planInactive.Id, 1, 'DownPayment', 1.0, null, null),
            inst(planExpired.Id, 1, 'DownPayment', 1.0, null, null),
            // planShort: pct-only summing to 90%
            inst(planShort.Id, 1, 'DownPayment', 0.90, null, null),
            // planFixed: 5,000 launch check + 90% recurring
            inst(planFixed.Id, 1, 'LaunchCheck', null, 5000, 'Launch Check'),
            inst(planFixed.Id, 2, 'RecurringInstallment', 0.90, null, 'Instalments')
        };

        // Activate everything except the deliberately inactive plan.
        List<PaymentPlan__c> toActivate = new List<PaymentPlan__c>{
            planProject, planGardens, planZone11, planZone12,
            planOut, planIn456, planOtherProject,
            planBad, planExpired, planShort, planFixed
        };
        for (PaymentPlan__c p : toActivate) {
            p.IsActive__c = true;
        }
        update toActivate;
    }

    // ---- builders ----

    /** Sets a field only if it exists in this org (sandbox-only required fields). */
    private static void putIfExists(SObject rec, String fieldName, Object value) {
        if (rec.getSObjectType().getDescribe().fields.getMap().containsKey(fieldName.toLowerCase())) {
            rec.put(fieldName, value);
        }
    }

    private static PriceList__c priceList(String name, Id projectId, Date effectiveFrom) {
        PriceList__c pl = new PriceList__c(
            Name = name,
            Project__c = projectId,
            EffectiveFrom__c = effectiveFrom,
            IsActive__c = true
        );
        putIfExists(pl, 'Currency__c', 'USD');
        return pl;
    }

    private static PaymentPlan__c plan(String name, String code, Id projectId) {
        PaymentPlan__c p = new PaymentPlan__c(
            Name = name,
            PlanCode__c = code,
            Project__c = projectId,
            DurationYears__c = 1,
            InstallmentFrequency__c = 'Annual',
            EffectiveFrom__c = Date.today().addMonths(-1),
            IsActive__c = false
        );
        putIfExists(p, 'Currency__c', 'USD');
        putIfExists(p, 'DeliveryOffsetMonths__c', 12);
        return p;
    }

    private static PaymentPlanInstallment__c inst(
        Id planId, Integer seq, String type, Decimal pct, Decimal fixedAmount, String description
    ) {
        PaymentPlanInstallment__c i = new PaymentPlanInstallment__c(
            PaymentPlan__c = planId,
            Sequence__c = seq,
            InstallmentType__c = type,
            Percentage__c = pct,
            FixedAmount__c = fixedAmount,
            Description__c = description
        );
        putIfExists(i, 'DueTrigger__c', type == 'PostHandoverInstallment' ? 'PostHandoverMonth' : 'Booking');
        return i;
    }

    private static Inventory__c theUnit() {
        return unitByName('VWT-U-001');
    }

    private static Inventory__c unitByName(String name) {
        return [SELECT Id, Project__c, Zone__c FROM Inventory__c WHERE Name = :name LIMIT 1];
    }

    private static PaymentPlanViewerController.PlanDTO planByCode(
        PaymentPlanViewerController.ViewerDTO dto,
        String code
    ) {
        for (PaymentPlanViewerController.PlanDTO p : dto.plans) {
            if (p.planCode == code)
                return p;
        }
        return null;
    }

    // ---- tests ----

    @IsTest
    static void project_plan_template_amounts_and_totals() {
        Test.startTest();
        PaymentPlanViewerController.ViewerDTO dto = PaymentPlanViewerController.getPaymentPlans(theUnit().Id);
        Test.stopTest();

        System.assertNotEquals(null, dto.price, 'Active price list item expected');
        System.assertEquals(400000, dto.price.listPrice, 'Unit list price');
        System.assertEquals('VWT-U-001', dto.unit.name, 'Unit mapped');
        System.assertEquals('Building 1', dto.unit.buildingName, 'Building name mapped');

        PaymentPlanViewerController.PlanDTO p = planByCode(dto, 'VWT-PROJ');
        System.assertNotEquals(null, p, 'Project plan returned');
        System.assertEquals('Project', p.specificity, 'Project-wide specificity');
        System.assertEquals(400000, p.effectivePrice, 'Effective price is the list price');
        System.assertEquals(2, p.rows.size(), 'Template rows shown as-is (no schedule expansion this phase)');
        System.assertEquals(40000, p.rows[0].amount, 'DP = 10% of 400k');
        System.assertEquals(360000, p.rows[1].amount, 'Recurring = 90% of 400k');
        System.assertEquals(400000, p.totalAmount, 'Totals reconcile to the list price');
        System.assertEquals(0, p.postHandoverAmount, 'Plain recurring stream stays pre-handover');
        System.assertEquals(false, p.totalsWarning, 'Sums to 100%');
        System.assertEquals(null, p.rows[0].dueDate, 'No due dates without schedule generation');
        System.assertEquals('Booking', p.rows[0].dueTrigger, 'Timing word derived from DownPayment type');
        System.assertEquals('MonthsAfterBooking', p.rows[1].dueTrigger, 'Timing word derived from Recurring type');
    }

    @IsTest
    static void gardens_style_groups_pre_and_post_handover() {
        Test.startTest();
        PaymentPlanViewerController.ViewerDTO dto = PaymentPlanViewerController.getPaymentPlans(theUnit().Id);
        Test.stopTest();

        PaymentPlanViewerController.PlanDTO p = planByCode(dto, 'VWT-GARD');
        System.assertNotEquals(null, p, 'Gardens plan returned');
        System.assertEquals(3, p.rows.size(), '1 pre + 2 post rows');

        Integer postCount = 0;
        for (PaymentPlanViewerController.RowDTO r : p.rows) {
            if (r.isPostHandover)
                postCount++;
        }
        System.assertEquals(2, postCount, 'Exactly the 2 PostHandoverInstallment rows are post-handover');
        System.assertEquals('PostHandoverMonth', p.rows[1].dueTrigger, 'Post-handover timing word');
        System.assertEquals(200000, p.preHandoverAmount, '50% of 400k before handover');
        System.assertEquals(200000, p.postHandoverAmount, '2 x 25% of 400k after handover');
        System.assertEquals(400000, p.totalAmount, 'Reconciles to the list price');
        System.assertEquals(0.50, p.preHandoverPct, 'Pre-handover percentage');
        System.assertEquals(0.50, p.postHandoverPct, 'Post-handover percentage');
    }

    @IsTest
    static void zoned_unit_sees_only_plans_containing_its_zone() {
        Test.startTest();
        PaymentPlanViewerController.ViewerDTO dto = PaymentPlanViewerController.getPaymentPlans(
            unitByName('VWT-U-002').Id
        );
        Test.stopTest();

        System.assertEquals(1, dto.plans.size(), 'Only the plan whose zone list contains in-c 4');
        PaymentPlanViewerController.PlanDTO outPlan = planByCode(dto, 'VWT-OUT');
        System.assertNotEquals(null, outPlan, 'Multi-zone plan containing in-c 4 applies');
        System.assertEquals('Zone', outPlan.specificity, 'Zone plans use the Zone badge');
        System.assertEquals('in-c 4', dto.unit.zone, 'Unit zone returned to the LWC');
        System.assertEquals(2, outPlan.specificityRank, 'Zone rank');
        System.assertEquals('out 4, out 5, out 6, in-c 4, in-c 5, in-c 6', outPlan.specificityDetail, 'Names the zones');

        System.assertEquals(null, planByCode(dto, 'VWT-IN4'), 'in 4 must NOT match in-c 4');
        System.assertEquals(null, planByCode(dto, 'VWT-Z11'), 'Unrelated zone plan hidden');
        System.assertEquals(null, planByCode(dto, 'VWT-Z12'), 'Unrelated zone plan hidden');
        System.assertEquals(null, planByCode(dto, 'VWT-P2OUT'), 'Matching zone in ANOTHER project hidden');
        System.assertEquals(null, planByCode(dto, 'VWT-PROJ'), 'Project-wide (blank zone) plan hidden for a zoned unit');
    }

    @IsTest
    static void zoned_unit_without_matching_plan_sees_none() {
        Test.startTest();
        PaymentPlanViewerController.ViewerDTO dto = PaymentPlanViewerController.getPaymentPlans(
            unitByName('VWT-U-003').Id
        );
        Test.stopTest();

        System.assertEquals(0, dto.plans.size(), 'Zone 1 matches no plan (not Zone 11 or Zone 12) and blank-zone plans are hidden');
        System.assertEquals('Zone 1', dto.unit.zone, 'Unit zone returned so the LWC can explain the empty state');
        System.assertEquals(null, dto.price, 'No price list item for this unit');
    }

    @IsTest
    static void unit_without_zone_sees_only_project_wide_plans() {
        Test.startTest();
        PaymentPlanViewerController.ViewerDTO dto = PaymentPlanViewerController.getPaymentPlans(theUnit().Id);
        Test.stopTest();

        System.assert(dto.plans.size() > 0, 'Project-wide plans listed');
        System.assertEquals(null, dto.unit.zone, 'Unit without a zone');
        for (PaymentPlanViewerController.PlanDTO p : dto.plans) {
            System.assertEquals('Project', p.specificity, 'Only project-wide plans for a unit without a zone');
        }
        System.assertEquals(null, planByCode(dto, 'VWT-Z11'), 'Zone plan hidden');
        System.assertEquals(null, planByCode(dto, 'VWT-Z12'), 'Zone plan hidden');
        System.assertEquals(null, planByCode(dto, 'VWT-OUT'), 'Zone plan hidden');
        System.assertEquals(null, planByCode(dto, 'VWT-IN4'), 'Zone plan hidden');
    }

    @IsTest
    static void zone_list_matching_is_whole_value() {
        System.assertEquals(true, PaymentPlanViewerController.zoneListContains('out 4, out 5, in-c 4', 'in-c 4'), 'Exact part');
        System.assertEquals(true, PaymentPlanViewerController.zoneListContains('Zone 5, Zone 7', ' zone 7 '), 'Trimmed, case-insensitive');
        System.assertEquals(true, PaymentPlanViewerController.zoneListContains('Zone 12', 'Zone 12'), 'Single value');
        System.assertEquals(false, PaymentPlanViewerController.zoneListContains('Zone 11', 'Zone 1'), 'No partial match');
        System.assertEquals(false, PaymentPlanViewerController.zoneListContains('in-c 4, in-c 5', 'in 4'), 'in 4 is not in-c 4');
        System.assertEquals(false, PaymentPlanViewerController.zoneListContains(null, 'Zone 1'), 'Blank plan zone');
        System.assertEquals(false, PaymentPlanViewerController.zoneListContains('Zone 1', null), 'Blank unit zone');
    }

    @IsTest
    static void misconfigured_plan_flagged_not_fatal() {
        Test.startTest();
        PaymentPlanViewerController.ViewerDTO dto = PaymentPlanViewerController.getPaymentPlans(theUnit().Id);
        Test.stopTest();

        PaymentPlanViewerController.PlanDTO bad = planByCode(dto, 'VWT-ZBAD');
        System.assertNotEquals(null, bad, 'Misconfigured plan still listed');
        System.assertEquals(true, bad.isMisconfigured, 'Flagged misconfigured');
        System.assert(
            bad.misconfiguredReason.contains('neither Percentage nor FixedAmount'),
            'Reason carries the loud-fail message'
        );
        System.assertEquals(0, bad.rows.size(), 'No rows for a misconfigured plan');

        System.assertNotEquals(null, planByCode(dto, 'VWT-PROJ'), 'Sibling plans still fully computed');
    }

    @IsTest
    static void inactive_expired_excluded_and_totals_warning() {
        Test.startTest();
        PaymentPlanViewerController.ViewerDTO dto = PaymentPlanViewerController.getPaymentPlans(theUnit().Id);
        Test.stopTest();

        System.assertEquals(null, planByCode(dto, 'VWT-INAC'), 'Inactive plan excluded');
        System.assertEquals(null, planByCode(dto, 'VWT-EXP'), 'Expired plan excluded');

        PaymentPlanViewerController.PlanDTO shortPlan = planByCode(dto, 'VWT-SHRT');
        System.assertNotEquals(null, shortPlan, 'Short plan listed');
        System.assertEquals(true, shortPlan.totalsWarning, 'Pct-only plan at 90% carries a totals warning');
    }

    @IsTest
    static void fixed_amount_rows_priced_and_no_totals_warning() {
        Test.startTest();
        PaymentPlanViewerController.ViewerDTO dto = PaymentPlanViewerController.getPaymentPlans(theUnit().Id);
        Test.stopTest();

        PaymentPlanViewerController.PlanDTO p = planByCode(dto, 'VWT-FIX');
        System.assertNotEquals(null, p, 'Fixed-amount plan listed');
        System.assertEquals(true, p.hasLaunchCheck, 'LaunchCheck row detected');
        System.assertEquals(false, p.totalsWarning, 'Mixed fixed+pct plans never warn');
        System.assertEquals(5000, p.rows[0].amount, 'Fixed amount carried as-is');
        System.assertEquals(0.0125, p.rows[0].pct, 'Fixed amount expressed as a share of the price');
        System.assertEquals(360000, p.rows[1].amount, '90% of 400k');
        System.assertEquals(365000, p.totalAmount, 'Fixed + pct total');
    }

    @IsTest
    static void no_active_price_returns_pct_only_rows() {
        PriceList__c pl = [SELECT Id FROM PriceList__c WHERE Name = 'Viewer Test Price List'];
        pl.IsActive__c = false;
        update pl;

        Test.startTest();
        PaymentPlanViewerController.ViewerDTO dto = PaymentPlanViewerController.getPaymentPlans(theUnit().Id);
        Test.stopTest();

        System.assertEquals(null, dto.price, 'No active price');
        PaymentPlanViewerController.PlanDTO p = planByCode(dto, 'VWT-PROJ');
        System.assertNotEquals(null, p, 'Plans still listed without a price');
        System.assertEquals(null, p.effectivePrice, 'No computed price');
        System.assertEquals(null, p.totalAmount, 'No totals without a price');
        System.assert(p.rows.size() > 0, 'Template rows still shown');
        System.assertEquals(0.10, p.rows[0].pct, 'Percentage shown without amounts');
        System.assertEquals(null, p.rows[0].amount, 'No amount without a price');
    }

    @IsTest
    static void single_active_price_item_no_warning_flag() {
        // One active Price List per Project and one Price List Item per Inventory
        // are enforced by validation, so a unit always resolves a single price.
        Test.startTest();
        PaymentPlanViewerController.ViewerDTO dto = PaymentPlanViewerController.getPaymentPlans(theUnit().Id);
        Test.stopTest();

        System.assertNotEquals(null, dto.price, 'Active price resolved');
        System.assertEquals(false, dto.price.hasMultipleActiveItems, 'Single active price item - no warning');
        System.assertEquals(400000, dto.price.listPrice, 'The unit price list item');
    }

    @IsTest
    static void blank_unit_id_throws() {
        Boolean threw = false;
        try {
            PaymentPlanViewerController.getPaymentPlans(null);
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assert(threw, 'Null unitId must throw an AuraHandledException');
    }

    @IsTest
    static void unknown_unit_id_throws() {
        Boolean threw = false;
        try {
            PaymentPlanViewerController.getPaymentPlans(
                Id.valueOf(String.valueOf(Inventory__c.SObjectType.getDescribe().getKeyPrefix()) + '000000000000AAA')
            );
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assert(threw, 'An inaccessible unitId must throw an AuraHandledException');
    }
}