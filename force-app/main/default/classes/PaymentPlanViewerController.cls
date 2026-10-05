/**
 * Read-only controller for the amwajPaymentPlanViewer LWC: given a unit
 * (Inventory__c), return every payment plan that applies to it, with each
 * plan's installment TEMPLATE priced against the unit's active list price.
 *
 * Phase 1 scope (2026-09-10): self-contained. No dependency on
 * PaymentScheduleGenerator (not deployed in this phase), so the viewer shows
 * the plan's template rows (percentage / fixed amount per installment) rather
 * than an expanded, dated schedule. Due dates are therefore not computed; the
 * LWC falls back to a timing word derived from the installment type.
 *
 * Plan applicability (only plans of the unit's own Project):
 *   - Unit HAS a Zone    -> only plans whose Zone__c list contains that zone.
 *     A plan's Zone__c may hold several comma-separated zones in one value
 *     (e.g. "out 4, out 5, in-c 4"); each part is compared as a whole value,
 *     so "Zone 1" never matches "Zone 10-11" and "in 4" never matches "in-c 4".
 *     Plans with a blank Zone are NOT shown to a zoned unit.
 *   - Unit has NO Zone   -> only plans with a blank Zone (project-wide).
 *
 * Not in this phase and deliberately absent (fields not deployed):
 * unit-specific plans, Launch Wave / building scoping, Arabic labels,
 * base-price overrides, plan currency + delivery offset, price-list currency,
 * min/max discount, installment due trigger + refundable flag.
 * The DTOs keep those properties so the LWC contract is unchanged; they are
 * simply never populated (currencyCode null -> LWC defaults to USD).
 *
 * `with sharing`: record-level sharing applies. Field access is system mode
 * (no WITH USER_MODE) so the viewer - and the deploy-time tests, which run as
 * whichever admin deploys the change set - do not depend on per-field FLS.
 * Read-only, no DML. A misconfigured plan (an installment with
 * neither Percentage nor FixedAmount) is flagged per-plan, never fails the
 * whole response.
 */
public with sharing class PaymentPlanViewerController {

    @AuraEnabled(cacheable=true)
    public static ViewerDTO getPaymentPlans(Id unitId) {
        if (unitId == null) {
            throw new AuraHandledException('unitId is required.');
        }

        // 1. The unit + its scoping context.
        List<Inventory__c> units = [
            SELECT
                Id,
                Name,
                Status__c,
                FloorNumber__c,
                Bedrooms__c,
                BuiltUpArea_SQM__c,
                Project__c,
                Project__r.Name,
                Building__c,
                Building__r.Name,
                Zone__c
            FROM Inventory__c
            WHERE Id = :unitId
            LIMIT 1
        ];
        if (units.isEmpty()) {
            throw new AuraHandledException('Unit not found or not accessible: ' + unitId);
        }
        Inventory__c unit = units[0];

        ViewerDTO dto = new ViewerDTO();
        dto.unit = mapUnit(unit);
        dto.generatedOn = Date.today();

        // 2. The unit's active price (latest active price list in its window).
        List<PriceListItem__c> priceItems = [
            SELECT Id, List_Price_2__c
            FROM PriceListItem__c
            WHERE
                Inventory__c = :unitId
                AND IsActive__c = TRUE
                AND PriceList__r.IsActive__c = TRUE
                AND PriceList__r.Project__c = :unit.Project__c
                AND PriceList__r.EffectiveFrom__c <= TODAY
                AND (PriceList__r.EffectiveTo__c = NULL
                OR PriceList__r.EffectiveTo__c >= TODAY)
            ORDER BY PriceList__r.EffectiveFrom__c DESC, CreatedDate DESC
        ];
        PriceListItem__c pli = priceItems.isEmpty() ? null : priceItems[0];
        if (pli != null) {
            dto.price = new PriceDTO();
            dto.price.priceListItemId = pli.Id;
            dto.price.listPrice = pli.List_Price_2__c;
            dto.price.hasMultipleActiveItems = priceItems.size() > 1;
        }

        // 3. The project's live plans + installment templates (single SOQL);
        //    zone applicability is decided in step 4.
        List<PaymentPlan__c> plans = [
            SELECT
                Id,
                Name,
                PlanCode__c,
                Description__c,
                DurationYears__c,
                InstallmentFrequency__c,
                Project__c,
                Zone__c,
                (
                    SELECT
                        Id,
                        Sequence__c,
                        InstallmentType__c,
                        Percentage__c,
                        FixedAmount__c,
                        Description__c
                    FROM PlanInstallments__r
                    ORDER BY Sequence__c ASC
                )
            FROM PaymentPlan__c
            WHERE
                IsActive__c = TRUE
                AND (EffectiveFrom__c = NULL
                OR EffectiveFrom__c <= TODAY)
                AND (EffectiveTo__c = NULL
                OR EffectiveTo__c >= TODAY)
                AND Project__c = :unit.Project__c
        ];

        // 4. Keep only the plans that apply to the unit's zone, price each
        //    plan's template; rank by specificity, then plan code.
        String unitZone = String.isBlank(unit.Zone__c) ? null : unit.Zone__c.trim();
        List<PlanDTO> planDtos = new List<PlanDTO>();
        for (PaymentPlan__c plan : plans) {
            Boolean planHasZone = String.isNotBlank(plan.Zone__c);
            Boolean zoneMatched = planHasZone && unitZone != null && zoneListContains(plan.Zone__c, unitZone);
            Boolean applies = (unitZone == null) ? !planHasZone : zoneMatched;
            if (applies) {
                planDtos.add(mapPlan(plan, unit, pli, zoneMatched));
            }
        }
        planDtos.sort();
        dto.plans = planDtos;
        return dto;
    }

    /**
     * True when one of the comma-separated parts of a plan's Zone value equals
     * the unit's zone as a whole value (trimmed, case-insensitive).
     */
    @TestVisible
    private static Boolean zoneListContains(String planZones, String unitZone) {
        if (String.isBlank(planZones) || String.isBlank(unitZone)) {
            return false;
        }
        String target = unitZone.trim();
        for (String part : planZones.split(',')) {
            if (part.trim().equalsIgnoreCase(target)) {
                return true;
            }
        }
        return false;
    }

    // -------------------- mapping --------------------

    private static UnitDTO mapUnit(Inventory__c unit) {
        UnitDTO u = new UnitDTO();
        u.id = unit.Id;
        u.name = unit.Name;
        u.unitCode = unit.Name; // UnitCode__c not deployed this phase
        u.status = unit.Status__c;
        u.floorNumber = unit.FloorNumber__c;
        u.bedrooms = unit.Bedrooms__c;
        u.builtUpArea = unit.BuiltUpArea_SQM__c;
        u.projectName = unit.Project__r != null ? unit.Project__r.Name : null;
        u.buildingName = unit.Building__r != null ? unit.Building__r.Name : null;
        u.zone = String.isBlank(unit.Zone__c) ? null : unit.Zone__c.trim();
        return u;
    }

    private static PlanDTO mapPlan(PaymentPlan__c plan, Inventory__c unit, PriceListItem__c pli, Boolean zoneMatched) {
        PlanDTO p = new PlanDTO();
        p.id = plan.Id;
        p.name = plan.Name;
        p.planCode = plan.PlanCode__c;
        p.description = plan.Description__c;
        p.durationYears = plan.DurationYears__c;
        p.installmentFrequency = plan.InstallmentFrequency__c;
        p.installmentCount = plan.PlanInstallments__r.size();
        p.rows = new List<RowDTO>();

        // Specificity badge, evaluated in precedence order.
        if (zoneMatched) {
            p.specificity = 'Zone';
            p.specificityRank = 2;
            p.specificityDetail = plan.Zone__c;
        } else {
            p.specificity = 'Project';
            p.specificityRank = 4;
        }

        Decimal listPrice = pli != null ? pli.List_Price_2__c : null;

        // A pct-only plan's percentages should sum to 100%. Mixed fixed+pct
        // plans (e.g. LaunchCheck rows) legitimately sum lower - no warning.
        Boolean hasFixedRows = false;
        Boolean hasLaunchCheckRows = false;
        Decimal sumPct = 0;
        for (PaymentPlanInstallment__c inst : plan.PlanInstallments__r) {
            Boolean hasFixed = inst.FixedAmount__c != null && inst.FixedAmount__c > 0;
            if (hasFixed) {
                hasFixedRows = true;
            }
            if (inst.InstallmentType__c == 'LaunchCheck') {
                hasLaunchCheckRows = true;
            }
            if (inst.Percentage__c != null) {
                sumPct += inst.Percentage__c;
            }
            if (!hasFixed && inst.Percentage__c == null) {
                // Loud-fail per plan: an installment that can never be priced.
                p.isMisconfigured = true;
                p.misconfiguredReason =
                    'Installment ' + inst.Sequence__c + ' has neither Percentage nor FixedAmount.';
            }
        }
        p.hasLaunchCheck = hasLaunchCheckRows;
        p.totalPercentage = sumPct;
        p.totalsWarning = !hasFixedRows && Math.abs(1.0 - sumPct) > 0.005;

        if (p.isMisconfigured) {
            p.rows.clear();
            return p;
        }

        // Price the template rows. With no active price, percentages only.
        p.effectivePrice = listPrice;
        Decimal preAmount = 0;
        Decimal postAmount = 0;
        Decimal prePct = 0;
        Decimal postPct = 0;
        Decimal total = 0;
        for (PaymentPlanInstallment__c inst : plan.PlanInstallments__r) {
            RowDTO r = new RowDTO();
            r.seq = inst.Sequence__c == null ? null : inst.Sequence__c.intValue();
            r.installmentType = inst.InstallmentType__c;
            r.label = inst.Description__c;
            r.dueTrigger = timingFor(inst.InstallmentType__c);
            r.isPostHandover = inst.InstallmentType__c == 'PostHandoverInstallment';

            Boolean hasFixed = inst.FixedAmount__c != null && inst.FixedAmount__c > 0;
            if (hasFixed) {
                r.amount = inst.FixedAmount__c.setScale(2);
                r.pct = (listPrice != null && listPrice != 0)
                    ? (r.amount / listPrice).setScale(4)
                    : null;
            } else {
                r.pct = inst.Percentage__c;
                r.amount = listPrice != null ? (listPrice * inst.Percentage__c).setScale(2) : null;
            }
            p.rows.add(r);

            if (r.amount != null) {
                total += r.amount;
                if (r.isPostHandover) {
                    postAmount += r.amount;
                } else {
                    preAmount += r.amount;
                }
            }
            if (r.pct != null) {
                if (r.isPostHandover) {
                    postPct += r.pct;
                } else {
                    prePct += r.pct;
                }
            }
        }
        if (listPrice != null) {
            p.totalAmount = total.setScale(2);
            p.preHandoverAmount = preAmount.setScale(2);
            p.postHandoverAmount = postAmount.setScale(2);
        }
        p.preHandoverPct = prePct.setScale(4);
        p.postHandoverPct = postPct.setScale(4);
        return p;
    }

    /**
     * No DueTrigger__c this phase: derive the LWC's timing word from the
     * installment type so the schedule column still reads sensibly.
     */
    private static String timingFor(String installmentType) {
        if (installmentType == 'DownPayment' || installmentType == 'LaunchCheck') {
            return 'Booking';
        }
        if (installmentType == 'HandoverPayment' || installmentType == 'DeliveryPayment') {
            return 'Handover';
        }
        if (installmentType == 'PostHandoverInstallment') {
            return 'PostHandoverMonth';
        }
        if (installmentType == 'FinalSettlement') {
            return 'FinalSettlement';
        }
        if (installmentType == 'SecondPayment' || installmentType == 'RecurringInstallment') {
            return 'MonthsAfterBooking';
        }
        return null;
    }

    // ---- DTOs (stable LWC contract - properties kept even where unused this phase) ----

    public class ViewerDTO {
        @AuraEnabled
        public UnitDTO unit;
        @AuraEnabled
        public PriceDTO price; // null = no active price list item
        @AuraEnabled
        public List<PlanDTO> plans;
        @AuraEnabled
        public Date generatedOn;
    }

    public class UnitDTO {
        @AuraEnabled
        public Id id;
        @AuraEnabled
        public String name;
        @AuraEnabled
        public String nameAr;
        @AuraEnabled
        public String unitCode;
        @AuraEnabled
        public String status;
        @AuraEnabled
        public Decimal floorNumber;
        @AuraEnabled
        public Decimal bedrooms;
        @AuraEnabled
        public Decimal builtUpArea;
        @AuraEnabled
        public String projectName;
        @AuraEnabled
        public String projectNameAr;
        @AuraEnabled
        public String buildingName;
        @AuraEnabled
        public String zone; // unit's Inventory Zone (null when blank)
    }

    public class PriceDTO {
        @AuraEnabled
        public Id priceListItemId;
        @AuraEnabled
        public Decimal listPrice;
        @AuraEnabled
        public String currencyCode;
        @AuraEnabled
        public Decimal minDiscountPct;
        @AuraEnabled
        public Decimal maxDiscountPct;
        @AuraEnabled
        public Boolean hasMultipleActiveItems = false;
    }

    public class PlanDTO implements Comparable {
        @AuraEnabled
        public Id id;
        @AuraEnabled
        public String name;
        @AuraEnabled
        public String nameAr;
        @AuraEnabled
        public String planCode;
        @AuraEnabled
        public String description;
        @AuraEnabled
        public String descriptionAr;
        @AuraEnabled
        public String specificity; // Zone | Project (Unit / Building / Wave reserved)
        @AuraEnabled
        public Integer specificityRank;
        @AuraEnabled
        public String specificityDetail;
        @AuraEnabled
        public String currencyCode;
        @AuraEnabled
        public Decimal durationYears;
        @AuraEnabled
        public String installmentFrequency;
        @AuraEnabled
        public Decimal deliveryOffsetMonths;
        @AuraEnabled
        public Date deliveryDate;
        @AuraEnabled
        public Decimal effectivePrice;
        @AuraEnabled
        public Boolean hasPriceOverride = false;
        @AuraEnabled
        public Decimal discountPct;
        @AuraEnabled
        public Decimal totalPercentage;
        @AuraEnabled
        public Boolean totalsWarning = false;
        @AuraEnabled
        public Boolean currencyMismatch = false;
        @AuraEnabled
        public Boolean hasLaunchCheck = false;
        @AuraEnabled
        public Boolean isMisconfigured = false;
        @AuraEnabled
        public String misconfiguredReason;
        @AuraEnabled
        public Integer installmentCount = 0;
        @AuraEnabled
        public List<RowDTO> rows;
        @AuraEnabled
        public Decimal preHandoverPct;
        @AuraEnabled
        public Decimal preHandoverAmount;
        @AuraEnabled
        public Decimal postHandoverPct;
        @AuraEnabled
        public Decimal postHandoverAmount;
        @AuraEnabled
        public Decimal totalAmount;

        public Integer compareTo(Object other) {
            PlanDTO o = (PlanDTO) other;
            if (specificityRank != o.specificityRank) {
                return specificityRank - o.specificityRank;
            }
            String a = planCode == null ? '' : planCode;
            String b = o.planCode == null ? '' : o.planCode;
            return a.compareTo(b);
        }
    }

    public class RowDTO {
        @AuraEnabled
        public Integer seq;
        @AuraEnabled
        public String installmentType;
        @AuraEnabled
        public String label;
        @AuraEnabled
        public String labelAr;
        @AuraEnabled
        public String dueTrigger;
        @AuraEnabled
        public Date dueDate;
        @AuraEnabled
        public Decimal pct; // 0.13 = 13%
        @AuraEnabled
        public Decimal amount;
        @AuraEnabled
        public Boolean isPostHandover = false;
        @AuraEnabled
        public Boolean isRefundable = false;
    }
}