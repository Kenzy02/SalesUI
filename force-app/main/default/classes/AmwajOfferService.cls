/**
 * Server-side equivalents of the org's "Sales: New EOI from Opportunity" and
 * "Sales: New Reservation from Opportunity" screen flows, for the React sales
 * workspace.
 *
 * Mirrors those flows deliberately:
 *  - same fields written, same guards (one EOI / one reservation per deal, one
 *    live EOI / reservation per unit, 0-20% whole-number discount, Selling
 *    projects only, paid EOI before a reservation), and the same
 *    "Required Information" customer details written to the person account;
 *  - the record writes run in system mode, as the flows do
 *    (SystemModeWithoutSharing), but only after this class has confirmed - in
 *    the user's own sharing context - that the user can edit the deal.
 *
 * Leaves every side effect to the org's record-triggered automation and does
 * NOT repeat it here: unit status (Available -> Held), EOI expiry
 * (PackageSettings__c.EOI_Period_Days__c), reservation hold expiry
 * (PackageSettings__c.DefaultHoldDays__c), deal stage, discount approvals.
 *
 * Adds what a multi-user web client needs: the deal and unit rows are locked
 * (FOR UPDATE) so two sales users cannot both hold the same unit, all writes
 * share one savepoint, and an identical retry is answered with the record it
 * already created instead of an error.
 */
public with sharing class AmwajOfferService {
    /** Mirrors fReservationfees (0.015 x list price) in New_EOI_From_Opportunity. */
    @TestVisible
    private static final Decimal RESERVATION_FEE_RATE = 0.015;
    private static final Decimal MAX_DISCOUNT_PCT = 20;
    private static final Integer REPLAY_WINDOW_MINUTES = 10;
    private static final SystemQueries SYSTEM_QUERIES = new SystemQueries();
    private static final SystemWrites SYSTEM_WRITES = new SystemWrites();

    // ================================================================= EOI

    public class OfferRequest {
        public Id dealId;
        public Id unitId;
        public Id paymentPlanId;
        public Decimal discountPct;
        public String paymentMethod;
        public String notes;
        public CustomerDetails customer;
        /** The list price the user reviewed; a different current price stops the request (nothing is created). */
        public Decimal expectedListPrice;
    }

    public class CustomerDetails {
        public String fullNameArabic;
        public String mobile;
        public String nationalId;
        public Date nationalIdDate;
        public String residenceId;
        public Date residenceIdDate;
        public String city;
        public String district;
        public String neighborhood;
        public String alley;
        public String houseNumber;
    }

    public static Map<String, Object> createEoi(OfferRequest req) {
        if (req == null || req.dealId == null || req.unitId == null || req.paymentPlanId == null) {
            throw AmwajSalesException.badRequest('Choose a customer deal, a unit and a payment plan.');
        }
        if (!Schema.SObjectType.EOI__c.isCreateable()) {
            throw AmwajSalesException.forbidden('You are not allowed to create EOIs.');
        }
        Decimal discount = validDiscount(req.discountPct);
        String paymentMethod = validPicklist(req.paymentMethod, EOI__c.Payment_Method__c, 'payment method');
        validateCustomer(req.customer);

        // Lock order (deal, then unit) is the same in every method to avoid deadlocks.
        Opportunity deal = lockEditableDeal(req.dealId);
        if (deal.EOI_Created__c == true) {
            EOI__c replay = SYSTEM_QUERIES.recentEoiForReplay(deal.Id, req.unitId);
            if (replay != null) {
                return eoiResult(replay.Id, true);
            }
            throw AmwajSalesException.conflict('This deal already has an EOI. Open it from the EOIs page.');
        }
        Inventory__c unit = lockUnit(req.unitId);
        if (unit.Project__r?.Status__c != 'Selling') {
            throw AmwajSalesException.conflict('Project ' + unit.Project__r?.Name + ' is not open for sale.');
        }
        if (unit.Status__c != 'Available') {
            throw AmwajSalesException.conflict(
                'Unit ' + unit.Name + ' is no longer available (' + statusLabel(unit.Status__c) + '). Choose another unit.'
            );
        }
        if (SYSTEM_QUERIES.hasLiveEoiOnUnit(unit.Id)) {
            throw AmwajSalesException.conflict('Unit ' + unit.Name + ' already has an active EOI. Choose another unit.');
        }
        PaymentPlanViewerController.ViewerDTO pricing = PaymentPlanViewerController.getPaymentPlans(unit.Id);
        if (pricing.price == null || pricing.price.listPrice == null) {
            throw AmwajSalesException.conflict('Unit ' + unit.Name + ' has no active price. Ask your sales admin to price it.');
        }
        requireEligiblePlan(pricing, req.paymentPlanId);
        if (req.expectedListPrice != null && req.expectedListPrice.setScale(2) != pricing.price.listPrice.setScale(2)) {
            throw AmwajSalesException.conflict(
                'The price of unit ' + unit.Name + ' changed to ' + pricing.price.listPrice.format() + ' since you reviewed it. ' +
                'Nothing was created. Review the new price and confirm again.'
            );
        }

        Savepoint sp = Database.setSavepoint();
        try {
            SYSTEM_WRITES.updateCustomer(deal.AccountId, req.customer);
            EOI__c eoi = new EOI__c(
                LinkedOpportunity__c = deal.Id,
                PersonAccount__c = deal.AccountId,
                Project__c = unit.Project__c,
                Inventory__c = unit.Id,
                Preferred_Payment_Plan__c = req.paymentPlanId,
                Payment_Method__c = paymentMethod,
                Discount__c = discount,
                Reservation_Fees__c = bookingFee(pricing.price.listPrice),
                Notes__c = trimToNull(req.notes),
                Status__c = 'Submitted'
            );
            if (deal.OriginatingLead__c != null) {
                // Lead attribution for deals converted in the app (the EOI create flow keeps a value it is given).
                eoi.Lead__c = deal.OriginatingLead__c;
            }
            SYSTEM_WRITES.insertRecord(eoi);
            if (deal.Project__c != unit.Project__c) {
                // As the EOI screen flow's "Backfill Opportunity Project" step does.
                SYSTEM_WRITES.updateRecord(new Opportunity(Id = deal.Id, Project__c = unit.Project__c));
            }
            return eoiResult(eoi.Id, false);
        } catch (DmlException e) {
            Database.rollback(sp);
            throw AmwajSalesException.badRequest(
                e.getDmlType(0) == StatusCode.DUPLICATE_VALUE
                    ? 'Another customer in Salesforce already has this mobile number or national ID. Check the customer details.'
                    : e.getDmlMessage(0)
            );
        }
    }

    /** Booking (reservation) fee as the org's EOI flow sets it. */
    public static Decimal bookingFee(Decimal listPrice) {
        return listPrice == null ? null : (listPrice * RESERVATION_FEE_RATE).setScale(2);
    }

    private static Map<String, Object> eoiResult(Id eoiId, Boolean replayed) {
        EOI__c e = SYSTEM_QUERIES.eoi(eoiId);
        Map<String, Object> out = new Map<String, Object>{
            'eoiId' => e.Id,
            'name' => e.Name,
            'status' => e.Status__c,
            'approvalStatus' => e.Approval_Status__c,
            'expiryDate' => e.ExpiryDate__c,
            'discountPct' => e.Discount__c,
            'reservationFee' => e.Reservation_Fees__c,
            'netUnitPrice' => e.Unit_Price__c,
            'paymentMethod' => e.Payment_Method__c,
            'unitId' => e.Inventory__c,
            'unitName' => e.Inventory__r?.Name,
            'unitStatus' => e.Inventory__r?.Status__c,
            'projectName' => e.Project__r?.Name,
            'paymentPlanId' => e.Preferred_Payment_Plan__c,
            'paymentPlanName' => e.Preferred_Payment_Plan__r?.Name,
            'customerId' => e.PersonAccount__c,
            'customerName' => e.PersonAccount__r?.Name,
            'dealId' => e.LinkedOpportunity__c,
            'dealName' => e.LinkedOpportunity__r?.Name,
            'recordUrl' => URL.getOrgDomainUrl().toExternalForm() + '/lightning/r/EOI__c/' + e.Id + '/view',
            'replayed' => replayed
        };
        out.put(
            'nextStep',
            AmwajSalesReadService.eoiNextStep(
                new Map<String, Object>{
                    'status' => e.Status__c,
                    'approvalStatus' => e.Approval_Status__c,
                    'discountPct' => e.Discount__c,
                    'documentAttached' => e.EOI_Document_Attached__c
                },
                new List<Map<String, Object>>()
            )
        );
        return out;
    }

    // ================================================================= Reservation

    public class ReservationRequest {
        public Id eoiId;
        public Id paymentPlanId;
        public Decimal depositAmount;
        public String notes;
    }

    public static Map<String, Object> createReservation(ReservationRequest req) {
        if (req == null || req.eoiId == null) {
            throw AmwajSalesException.badRequest('Choose the paid EOI to reserve from.');
        }
        if (!Schema.SObjectType.Reservation__c.isCreateable()) {
            throw AmwajSalesException.forbidden('You are not allowed to create reservations.');
        }
        if ([SELECT COUNT() FROM EOI__c WHERE Id = :req.eoiId WITH USER_MODE] == 0) {
            throw AmwajSalesException.notFound('This EOI was not found or is not shared with you.');
        }
        // Process fields (payment method, plan, discount) are read the way the org's flow reads them.
        EOI__c eoi = SYSTEM_QUERIES.eoiForReservation(req.eoiId);
        if (eoi.LinkedOpportunity__c == null) {
            throw AmwajSalesException.conflict('EOI ' + eoi.Name + ' is not linked to a deal.');
        }
        Opportunity deal = lockEditableDeal(eoi.LinkedOpportunity__c);
        if (deal.Reservation_Created__c == true) {
            Reservation__c replay = SYSTEM_QUERIES.recentReservationForReplay(eoi.Id);
            if (replay != null) {
                return reservationResult(replay.Id, true);
            }
            throw AmwajSalesException.conflict('This deal already has a reservation.');
        }
        if (eoi.Status__c != 'Paid') {
            throw AmwajSalesException.conflict(
                'EOI ' + eoi.Name + ' must be paid and verified by finance before the unit can be reserved.'
            );
        }
        if (eoi.Inventory__c == null) {
            throw AmwajSalesException.conflict('EOI ' + eoi.Name + ' has no preferred unit to reserve.');
        }
        Inventory__c unit = lockUnit(eoi.Inventory__c);
        if (SYSTEM_QUERIES.hasLiveReservationOnUnit(unit.Id)) {
            throw AmwajSalesException.conflict('Unit ' + unit.Name + ' already has a reservation.');
        }
        PaymentPlanViewerController.ViewerDTO pricing = PaymentPlanViewerController.getPaymentPlans(unit.Id);
        if (pricing.price == null || pricing.price.priceListItemId == null) {
            throw AmwajSalesException.conflict('Unit ' + unit.Name + ' has no active price. Ask your sales admin to price it.');
        }
        Id planId = req.paymentPlanId != null ? req.paymentPlanId : eoi.Preferred_Payment_Plan__c;
        if (planId == null) {
            throw AmwajSalesException.badRequest('Choose a payment plan.');
        }
        requireEligiblePlan(pricing, planId);

        Decimal deposit;
        if (eoi.Payment_Method__c == 'Cash') {
            // As in the flow: a cash buyer's deposit is what the sales user enters (or none).
            deposit = req.depositAmount == null ? 0 : req.depositAmount;
            if (deposit < 0) {
                throw AmwajSalesException.badRequest('The deposit cannot be negative.');
            }
        } else {
            deposit = downPayment(unit.Id, planId, eoi.Discount__c);
        }

        Savepoint sp = Database.setSavepoint();
        try {
            Reservation__c res = new Reservation__c(
                EOI__c = eoi.Id,
                Opportunity__c = deal.Id,
                PersonAccount__c = eoi.PersonAccount__c,
                Inventory__c = unit.Id,
                PriceListItem__c = pricing.price.priceListItemId,
                PaymentPlan__c = planId,
                Preferred_Project__c = deal.Project__c,
                Discount__c = eoi.Discount__c,
                DepositAmount__c = deposit,
                Notes__c = trimToNull(req.notes),
                Status__c = 'Submitted'
            );
            SYSTEM_WRITES.insertRecord(res);
            SYSTEM_WRITES.updateRecord(
                new Opportunity(Id = deal.Id, Project__c = eoi.Project__c, Reservation_Created__c = true)
            );
            return reservationResult(res.Id, false);
        } catch (DmlException e) {
            Database.rollback(sp);
            throw AmwajSalesException.badRequest(e.getDmlMessage(0));
        }
    }

    /** Down payment from the org's own "Calculate the Payment Plan - Subflow". */
    @TestVisible
    private static Decimal downPayment(Id unitId, Id planId, Decimal discountPct) {
        Flow.Interview calc = Flow.Interview.createInterview(
            'Calculate_the_Payment_Plan_Subflow',
            new Map<String, Object>{
                'Inventory_ID' => unitId,
                'PaymentPlan_ID' => planId,
                'Discount_Input' => discountPct
            }
        );
        calc.start();
        Object value = calc.getVariableValue('DownPayment_Var');
        return value == null ? 0 : ((Decimal) value).setScale(2);
    }

    private static Map<String, Object> reservationResult(Id reservationId, Boolean replayed) {
        Reservation__c r = SYSTEM_QUERIES.reservation(reservationId);
        return new Map<String, Object>{
            'reservationId' => r.Id,
            'name' => r.Name,
            'status' => r.Status__c,
            'holdExpiry' => r.HoldExpiry__c,
            'listPrice' => r.ListPrice__c,
            'netPrice' => r.NetPrice__c,
            'deposit' => r.DepositAmount__c,
            'unitName' => r.Inventory__r?.Name,
            'unitStatus' => r.Inventory__r?.Status__c,
            'replayed' => replayed
        };
    }

    // ================================================================= Signed EOI document

    private static final Set<String> DOCUMENT_EXTENSIONS = new Set<String>{ 'pdf', 'png', 'jpg', 'jpeg' };
    private static final Integer MAX_DOCUMENT_BYTES = 3 * 1024 * 1024;

    /**
     * Files the signed EOI document on the EOI and ticks "EOI Document
     * Attached" - the org's evidence that lets an EOI leave Submitted. Runs in
     * user mode: the Sales Executive permission set grants edit on that field.
     */
    public static Map<String, Object> attachSignedEoi(Id eoiId, String fileName, String base64Body) {
        if (eoiId == null || String.isBlank(fileName) || String.isBlank(base64Body)) {
            throw AmwajSalesException.badRequest('Choose the signed EOI file to upload.');
        }
        String ext = fileName.contains('.') ? fileName.substringAfterLast('.').toLowerCase() : '';
        if (!DOCUMENT_EXTENSIONS.contains(ext)) {
            throw AmwajSalesException.badRequest('Upload the signed EOI as a PDF, PNG or JPG file.');
        }
        Blob body;
        try {
            body = EncodingUtil.base64Decode(base64Body);
        } catch (Exception e) {
            throw AmwajSalesException.badRequest('The file could not be read. Try uploading it again.');
        }
        if (body.size() > MAX_DOCUMENT_BYTES) {
            throw AmwajSalesException.badRequest('The file is larger than 3 MB. Scan it at a lower resolution and try again.');
        }
        List<EOI__c> eois = [SELECT Id, Name, Status__c FROM EOI__c WHERE Id = :eoiId WITH USER_MODE];
        if (eois.isEmpty()) {
            throw AmwajSalesException.notFound('This EOI was not found or is not shared with you.');
        }
        if (!AmwajSalesSupport.canEdit(eoiId)) {
            throw AmwajSalesException.forbidden('You cannot add documents to EOI ' + eois[0].Name + '.');
        }
        if (eois[0].Status__c == 'Expired' || eois[0].Status__c == 'Refunded') {
            throw AmwajSalesException.conflict('EOI ' + eois[0].Name + ' is ' + eois[0].Status__c.toLowerCase() + '.');
        }
        Savepoint sp = Database.setSavepoint();
        try {
            ContentVersion v = new ContentVersion(
                Title = fileName.substringBeforeLast('.'),
                PathOnClient = fileName,
                VersionData = body,
                FirstPublishLocationId = eoiId
            );
            Database.insert(v, AccessLevel.USER_MODE);
            Database.update(new EOI__c(Id = eoiId, EOI_Document_Attached__c = true), AccessLevel.USER_MODE);
        } catch (DmlException e) {
            Database.rollback(sp);
            throw AmwajSalesException.badRequest(e.getDmlMessage(0));
        }
        return AmwajSalesReadService.eoiDetail(eoiId);
    }

    // ================================================================= shared guards

    /** The deal, locked, after confirming in the user's sharing context that they can edit it. */
    private static Opportunity lockEditableDeal(Id dealId) {
        List<Opportunity> deals = [SELECT Id FROM Opportunity WHERE Id = :dealId WITH USER_MODE];
        if (deals.isEmpty()) {
            throw AmwajSalesException.notFound('This deal was not found or is not shared with you.');
        }
        if (!AmwajSalesSupport.canEdit(dealId)) {
            throw AmwajSalesException.forbidden('You can only start offers on deals you are allowed to edit.');
        }
        Opportunity deal = SYSTEM_QUERIES.lockDeal(dealId);
        if (deal.IsClosed) {
            throw AmwajSalesException.conflict('This deal is closed (' + deal.StageName + ').');
        }
        if (deal.AccountId == null) {
            throw AmwajSalesException.conflict('This deal has no customer account.');
        }
        return deal;
    }

    private static Inventory__c lockUnit(Id unitId) {
        // The user must be able to see the unit; the lock itself is taken in system mode.
        if ([SELECT COUNT() FROM Inventory__c WHERE Id = :unitId WITH USER_MODE] == 0) {
            throw AmwajSalesException.notFound('This unit was not found or is not shared with you.');
        }
        return SYSTEM_QUERIES.lockUnit(unitId);
    }

    private static void requireEligiblePlan(PaymentPlanViewerController.ViewerDTO pricing, Id planId) {
        for (PaymentPlanViewerController.PlanDTO p : pricing.plans) {
            if (p.id == planId) {
                if (p.isMisconfigured == true) {
                    throw AmwajSalesException.conflict('Payment plan ' + p.name + ' is not set up correctly. Choose another plan.');
                }
                return;
            }
        }
        throw AmwajSalesException.badRequest('That payment plan is not available for this unit. Choose one of the listed plans.');
    }

    @TestVisible
    private static Decimal validDiscount(Decimal discountPct) {
        Decimal d = discountPct == null ? 0 : discountPct;
        if (d < 0 || d > MAX_DISCOUNT_PCT || d != d.round(System.RoundingMode.DOWN)) {
            throw AmwajSalesException.badRequest('The discount must be a whole number between 0% and 20%.');
        }
        return d;
    }

    private static String validPicklist(String value, Schema.SObjectField field, String label) {
        for (Schema.PicklistEntry e : field.getDescribe().getPicklistValues()) {
            if (e.isActive() && e.getValue() == value) {
                return value;
            }
        }
        throw AmwajSalesException.badRequest('Choose a ' + label + '.');
    }

    /** The "Required Information" screen of the org's EOI flow, as server-side validation. */
    @TestVisible
    private static void validateCustomer(CustomerDetails c) {
        if (c == null) {
            throw AmwajSalesException.badRequest('Confirm the customer details.');
        }
        List<String> missing = new List<String>();
        if (String.isBlank(c.fullNameArabic)) {
            missing.add('full name');
        }
        if (String.isBlank(c.mobile)) {
            missing.add('mobile');
        }
        if (String.isBlank(c.nationalId)) {
            missing.add('national ID');
        }
        if (c.nationalIdDate == null) {
            missing.add('national ID date');
        }
        if (String.isBlank(c.city)) {
            missing.add('city');
        }
        if (String.isBlank(c.district)) {
            missing.add('district');
        }
        if (String.isBlank(c.neighborhood)) {
            missing.add('neighborhood');
        }
        if (String.isBlank(c.alley)) {
            missing.add('alley');
        }
        if (String.isBlank(c.houseNumber)) {
            missing.add('house number');
        }
        if (!missing.isEmpty()) {
            throw AmwajSalesException.badRequest('Please complete the customer ' + String.join(missing, ', ') + '.');
        }
        String id = c.nationalId.trim();
        if (id.length() != 12 || !id.isNumeric()) {
            throw AmwajSalesException.badRequest('The national ID must be exactly 12 digits.');
        }
        if (c.nationalIdDate >= Date.today() || (c.residenceIdDate != null && c.residenceIdDate >= Date.today())) {
            throw AmwajSalesException.badRequest('ID issue dates must be in the past.');
        }
        if (!isValidMobile(c.mobile.trim())) {
            throw AmwajSalesException.badRequest(
                'An Iraqi mobile must start with 075, 077, 078 or 079 and be exactly 11 digits. ' +
                'An international number must start with + or 00 and be 12 to 16 characters long.'
            );
        }
        validPicklist(c.city, Lead.City__c, 'city');
    }

    /** Same rule as the Mobile_Number_Must_be_in_Iraq validation rules. */
    public static Boolean isValidMobile(String m) {
        Boolean iraqi = (m.startsWith('075') || m.startsWith('077') || m.startsWith('078') || m.startsWith('079')) &&
            m.length() == 11;
        Boolean international = (m.startsWith('+') || m.startsWith('00')) && m.length() >= 12 && m.length() <= 16;
        return iraqi || international;
    }

    private static String statusLabel(String status) {
        for (Schema.PicklistEntry e : Inventory__c.Status__c.getDescribe().getPicklistValues()) {
            if (e.getValue() == status) {
                return e.getLabel();
            }
        }
        return status;
    }

    private static String trimToNull(String s) {
        return String.isBlank(s) ? null : s.trim();
    }

    // ================================================================= system-mode helpers

    /**
     * Queries that must see every user's records (duplicate and concurrency
     * checks, as the org's flows do) and the post-insert read-back of fields
     * set by automation. Only called after the access checks above.
     */
    private without sharing class SystemQueries {
        Opportunity lockDeal(Id dealId) {
            return [
                SELECT Id, IsClosed, StageName, AccountId, Project__c, EOI_Created__c, Reservation_Created__c, OriginatingLead__c
                FROM Opportunity
                WHERE Id = :dealId
                WITH SYSTEM_MODE
                FOR UPDATE
            ];
        }

        Inventory__c lockUnit(Id unitId) {
            return [
                SELECT Id, Name, Status__c, Project__c, Project__r.Name, Project__r.Status__c
                FROM Inventory__c
                WHERE Id = :unitId
                WITH SYSTEM_MODE
                FOR UPDATE
            ];
        }

        Boolean hasLiveEoiOnUnit(Id unitId) {
            Set<String> excluded = AmwajSalesSupport.LIVE_EOI_EXCLUDED_STATUSES;
            return [SELECT COUNT() FROM EOI__c WHERE Inventory__c = :unitId AND Status__c NOT IN :excluded WITH SYSTEM_MODE] > 0;
        }

        Boolean hasLiveReservationOnUnit(Id unitId) {
            Set<String> excluded = AmwajSalesSupport.LIVE_RESERVATION_EXCLUDED_STATUSES;
            return [SELECT COUNT() FROM Reservation__c WHERE Inventory__c = :unitId AND Status__c NOT IN :excluded WITH SYSTEM_MODE] > 0;
        }

        /** The caller's own EOI on this deal and unit from the last few minutes: a retried request. */
        EOI__c recentEoiForReplay(Id dealId, Id unitId) {
            Datetime since = Datetime.now().addMinutes(-REPLAY_WINDOW_MINUTES);
            Id me = UserInfo.getUserId();
            List<EOI__c> rows = [
                SELECT Id
                FROM EOI__c
                WHERE LinkedOpportunity__c = :dealId AND Inventory__c = :unitId AND CreatedById = :me
                    AND CreatedDate >= :since
                WITH SYSTEM_MODE
                ORDER BY CreatedDate DESC
                LIMIT 1
            ];
            return rows.isEmpty() ? null : rows[0];
        }

        Reservation__c recentReservationForReplay(Id eoiId) {
            Datetime since = Datetime.now().addMinutes(-REPLAY_WINDOW_MINUTES);
            Id me = UserInfo.getUserId();
            List<Reservation__c> rows = [
                SELECT Id
                FROM Reservation__c
                WHERE EOI__c = :eoiId AND CreatedById = :me AND CreatedDate >= :since
                WITH SYSTEM_MODE
                ORDER BY CreatedDate DESC
                LIMIT 1
            ];
            return rows.isEmpty() ? null : rows[0];
        }

        EOI__c eoi(Id eoiId) {
            return [
                SELECT Id, Name, Status__c, Approval_Status__c, ExpiryDate__c, Discount__c, Reservation_Fees__c,
                    Unit_Price__c, Payment_Method__c, EOI_Document_Attached__c, Inventory__c, Inventory__r.Name,
                    Inventory__r.Status__c, Project__r.Name, Preferred_Payment_Plan__c, Preferred_Payment_Plan__r.Name,
                    PersonAccount__c, PersonAccount__r.Name, LinkedOpportunity__c, LinkedOpportunity__r.Name
                FROM EOI__c
                WHERE Id = :eoiId
                WITH SYSTEM_MODE
            ];
        }

        EOI__c eoiForReservation(Id eoiId) {
            return [
                SELECT Id, Name, Status__c, Discount__c, Payment_Method__c, Inventory__c, LinkedOpportunity__c,
                    PersonAccount__c, Preferred_Payment_Plan__c, Project__c
                FROM EOI__c
                WHERE Id = :eoiId
                WITH SYSTEM_MODE
            ];
        }

        Reservation__c reservation(Id reservationId) {
            return [
                SELECT Id, Name, Status__c, HoldExpiry__c, ListPrice__c, NetPrice__c, DepositAmount__c,
                    Inventory__r.Name, Inventory__r.Status__c
                FROM Reservation__c
                WHERE Id = :reservationId
                WITH SYSTEM_MODE
            ];
        }
    }

    /** System-mode writes, matching the run mode of the org's EOI / reservation flows. */
    private without sharing class SystemWrites {
        void insertRecord(SObject rec) {
            Database.insert(rec, AccessLevel.SYSTEM_MODE);
        }

        void updateRecord(SObject rec) {
            Database.update(rec, AccessLevel.SYSTEM_MODE);
        }

        void updateCustomer(Id accountId, CustomerDetails c) {
            Account a = new Account(
                Id = accountId,
                Full_Name__pc = c.fullNameArabic.trim(),
                PersonMobilePhone = c.mobile.trim(),
                NationalID__pc = c.nationalId.trim(),
                National_ID_Date__pc = c.nationalIdDate,
                Residence_ID__pc = trimToNull(c.residenceId),
                Residence_ID_Date__pc = c.residenceIdDate,
                BillingCity = c.city,
                District__pc = c.district.trim(),
                Neighborhood__pc = c.neighborhood.trim(),
                Alley__pc = c.alley.trim(),
                House_Number__pc = c.houseNumber.trim()
            );
            Database.update(a, AccessLevel.SYSTEM_MODE);
        }
    }
}
