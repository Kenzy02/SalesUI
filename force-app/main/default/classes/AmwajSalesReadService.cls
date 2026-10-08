/**
 * Read side of the Amwaj sales workspace API.
 *
 * Every query selects only fields the running user can read and runs
 * WITH USER_MODE, so object access, field-level security and record sharing
 * all apply; a field the user cannot see is simply absent (null) in the
 * response. "My" scopes are derived from the session user on the server
 * (UserInfo), never from a client-supplied owner id.
 */
public with sharing class AmwajSalesReadService {
    private static final Integer UNIT_PAGE_SIZE = 24;
    private static final Integer HOLD_WARNING_DAYS = 2;

    // ------------------------------------------------------------------ me

    public static Map<String, Object> me() {
        PackageSettings__c s = AmwajSalesSupport.settings();
        Id me = UserInfo.getUserId();
        List<User> users = [SELECT Id, Name, FirstName FROM User WHERE Id = :me WITH USER_MODE];
        return new Map<String, Object>{
            'userId' => me,
            'name' => users.isEmpty() ? UserInfo.getName() : users[0].Name,
            'firstName' => users.isEmpty() ? UserInfo.getFirstName() : users[0].FirstName,
            'currencyCode' => UserInfo.getDefaultCurrency(),
            'timeZone' => UserInfo.getTimeZone().getID(),
            'locale' => UserInfo.getLocale(),
            'today' => Date.today(),
            'eoiPeriodDays' => s.EOI_Period_Days__c,
            'reservationHoldDays' => s.DefaultHoldDays__c,
            'canCreateEoi' => Schema.SObjectType.EOI__c.isCreateable(),
            'canCreateReservation' => Schema.SObjectType.Reservation__c.isCreateable(),
            'canEditEoi' => Schema.SObjectType.EOI__c.isUpdateable(),
            'activitiesEnabled' => AmwajSalesSupport.activitiesEnabled()
        };
    }

    // ------------------------------------------------------------------ leads

    private static final Map<String, String> LEAD_ROW = new Map<String, String>{
        'name' => 'Name',
        'status' => 'Status',
        'source' => 'LeadSource',
        'channel' => 'Channel__c',
        'rating' => 'Rating',
        'mobile' => 'MobilePhone',
        'email' => 'Email',
        'city' => 'City__c',
        'projectInterestId' => 'Project_Interest__c',
        'projectInterest' => 'Project_Interest__r.Name',
        'secondProjectInterestId' => 'nd_Project_of_Interest__c',
        'interestedUnitId' => 'Interested_Unit__c',
        'interestedUnit' => 'Interested_Unit__r.Name',
        'interestedUnitType' => 'Interested_Unit__r.Unit_Type__c',
        'desiredArea' => 'DesiredUnitArea__c',
        'createdDate' => 'CreatedDate',
        'lastActivityDate' => 'LastActivityDate'
    };

    private static final Map<String, String> LEAD_DETAIL = new Map<String, String>{
        'firstName' => 'FirstName',
        'lastName' => 'LastName',
        'phone' => 'Phone',
        'description' => 'Description',
        'profession' => 'Profession__c',
        'nationality' => 'Nationality__c',
        'organization' => 'Organization__c',
        'salesDepartment' => 'Sales_Department__c',
        'secondProjectInterest' => 'nd_Project_of_Interest__r.Name',
        'buyerName' => 'Buyer__r.Name',
        'brokerName' => 'Broker__r.Name',
        'ownerName' => 'Owner.Name',
        'ownerId' => 'OwnerId',
        'isConverted' => 'IsConverted',
        'convertedAccountId' => 'ConvertedAccountId',
        'convertedDealId' => 'ConvertedOpportunityId'
    };

    /** Lead id -> its earliest open follow-up task the user can see. */
    private static Map<Id, Map<String, Object>> nextFollowUps(Set<Id> leadIds) {
        Map<Id, Map<String, Object>> byLead = new Map<Id, Map<String, Object>>();
        if (leadIds.isEmpty() || !AmwajSalesSupport.activitiesEnabled()) {
            return byLead;
        }
        List<Id> ids = new List<Id>(leadIds);
        for (Task t : (List<Task>) Database.query(
            'SELECT WhoId, Subject, ActivityDate FROM Task WHERE WhoId IN :ids AND IsClosed = false' +
            ' WITH USER_MODE ORDER BY ActivityDate ASC NULLS LAST'
        )) {
            if (!byLead.containsKey(t.WhoId)) {
                byLead.put(t.WhoId, new Map<String, Object>{ 'subject' => t.Subject, 'dueDate' => t.ActivityDate });
            }
        }
        return byLead;
    }

    public static Map<String, Object> leads(String status, String search, String projectId) {
        AmwajSalesSupport.requireReadable(Lead.SObjectType);
        Id me = AmwajSalesSupport.currentUserId();
        String term = AmwajSalesSupport.likeTerm(search);
        String soql =
            'SELECT ' + AmwajSalesSupport.selectList(Lead.SObjectType, LEAD_ROW.values()) +
            ' FROM Lead WHERE OwnerId = :me AND IsConverted = false';
        if (String.isNotBlank(status)) {
            soql += ' AND Status = :status';
        }
        if (term != null) {
            soql += ' AND (Name LIKE :term OR MobilePhone LIKE :term OR Email LIKE :term)';
        }
        if (String.isNotBlank(projectId)) {
            // First or second project of interest, as recorded on the lead.
            soql += ' AND (Project_Interest__c = :projectId OR nd_Project_of_Interest__c = :projectId)';
        }
        soql += ' WITH USER_MODE ORDER BY CreatedDate DESC LIMIT 200';

        List<SObject> rows = Database.query(soql);
        Map<Id, Map<String, Object>> followUps = nextFollowUps(new Map<Id, SObject>(rows).keySet());
        List<Map<String, Object>> out = new List<Map<String, Object>>();
        for (SObject l : rows) {
            out.add(leadRow(l, followUps.get(l.Id)));
        }
        return new Map<String, Object>{ 'leads' => out, 'statusOptions' => AmwajSalesSupport.picklist(Lead.Status) };
    }

    private static Map<String, Object> leadRow(SObject l, Map<String, Object> nextFollowUp) {
        Map<String, Object> r = AmwajSalesSupport.row(l, LEAD_ROW);
        r.put('nextFollowUp', nextFollowUp);
        return r;
    }

    public static Map<String, Object> leadDetail(Id leadId) {
        AmwajSalesSupport.requireReadable(Lead.SObjectType);
        List<String> paths = new List<String>(LEAD_ROW.values());
        paths.addAll(LEAD_DETAIL.values());
        List<SObject> rows = Database.query(
            'SELECT ' + AmwajSalesSupport.selectList(Lead.SObjectType, paths) +
            ' FROM Lead WHERE Id = :leadId WITH USER_MODE'
        );
        if (rows.isEmpty()) {
            throw AmwajSalesException.notFound('This lead was not found or is not shared with you.');
        }
        Map<String, Object> r = leadRow(rows[0], nextFollowUps(new Set<Id>{ leadId }).get(leadId));
        r.putAll(AmwajSalesSupport.row(rows[0], LEAD_DETAIL));
        r.put('isMine', (Id) r.get('ownerId') == AmwajSalesSupport.currentUserId());
        r.put('canEdit', AmwajSalesSupport.canEdit(leadId));
        r.put('canEditStatus', Schema.SObjectType.Lead.fields.Status.isUpdateable());
        r.put('canEditRating', Schema.SObjectType.Lead.fields.Rating.isUpdateable());
        r.put('canEditDescription', Schema.SObjectType.Lead.fields.Description.isUpdateable());
        r.put('statusOptions', AmwajSalesSupport.picklist(Lead.Status));
        r.put('ratingOptions', AmwajSalesSupport.picklist(Lead.Rating));
        r.put('activities', activities(leadId));
        return r;
    }

    // ------------------------------------------------------------------ activities

    private static final Map<String, String> TASK_ROW = new Map<String, String>{
        'subject' => 'Subject',
        'status' => 'Status',
        'priority' => 'Priority',
        'dueDate' => 'ActivityDate',
        'comments' => 'Description',
        'isClosed' => 'IsClosed',
        'kind' => 'TaskSubtype',
        'completedAt' => 'CompletedDateTime',
        'createdDate' => 'CreatedDate',
        'ownerName' => 'Owner.Name'
    };

    /** Tasks on a lead (WhoId) or a deal (WhatId) visible to the user. */
    public static List<Map<String, Object>> activities(Id parentId) {
        List<Map<String, Object>> out = new List<Map<String, Object>>();
        if (!AmwajSalesSupport.activitiesEnabled()) {
            return out;
        }
        for (SObject t : Database.query(
            'SELECT ' + AmwajSalesSupport.selectList(Task.SObjectType, TASK_ROW.values()) +
            ' FROM Task WHERE WhoId = :parentId OR WhatId = :parentId WITH USER_MODE' +
            ' ORDER BY IsClosed ASC, ActivityDate DESC NULLS LAST, CreatedDate DESC LIMIT 100'
        )) {
            out.add(AmwajSalesSupport.row(t, TASK_ROW));
        }
        return out;
    }

    // ------------------------------------------------------------------ deals (customers)

    private static final Map<String, String> DEAL_ROW = new Map<String, String>{
        'name' => 'Name',
        'stage' => 'StageName',
        'isClosed' => 'IsClosed',
        'amount' => 'Amount',
        'closeDate' => 'CloseDate',
        'lastActivityDate' => 'LastActivityDate',
        'eoiCreated' => 'EOI_Created__c',
        'reservationCreated' => 'Reservation_Created__c',
        'accountId' => 'AccountId',
        'customerName' => 'Account.Name',
        'mobile' => 'Account.PersonMobilePhone',
        'email' => 'Account.PersonEmail',
        'projectId' => 'Project__c',
        'projectName' => 'Project__r.Name',
        'interestedUnitId' => 'Interested_Unit__c',
        'interestedUnitName' => 'Interested_Unit__r.Name',
        'interestedUnitType' => 'Interested_Unit__r.Unit_Type__c',
        'ownerId' => 'OwnerId',
        'ownerName' => 'Owner.Name'
    };

    public static Map<String, Object> deals(String search, String projectId) {
        AmwajSalesSupport.requireReadable(Opportunity.SObjectType);
        Id me = AmwajSalesSupport.currentUserId();
        String term = AmwajSalesSupport.likeTerm(search);
        String soql = 'SELECT ' + AmwajSalesSupport.selectList(Opportunity.SObjectType, DEAL_ROW.values()) +
            ' FROM Opportunity WHERE OwnerId = :me';
        if (term != null) {
            soql += ' AND (Name LIKE :term OR Account.Name LIKE :term)';
        }
        if (String.isNotBlank(projectId)) {
            soql += ' AND Project__c = :projectId';
        }
        soql += ' WITH USER_MODE ORDER BY IsClosed ASC, LastModifiedDate DESC LIMIT 200';
        List<Map<String, Object>> out = new List<Map<String, Object>>();
        for (SObject o : Database.query(soql)) {
            out.add(AmwajSalesSupport.row(o, DEAL_ROW));
        }
        return new Map<String, Object>{ 'deals' => out };
    }

    public static Map<String, Object> dealDetail(Id dealId) {
        AmwajSalesSupport.requireReadable(Opportunity.SObjectType);
        List<SObject> rows = Database.query(
            'SELECT ' + AmwajSalesSupport.selectList(Opportunity.SObjectType, DEAL_ROW.values()) +
            ' FROM Opportunity WHERE Id = :dealId WITH USER_MODE'
        );
        if (rows.isEmpty()) {
            throw AmwajSalesException.notFound('This deal was not found or is not shared with you.');
        }
        Map<String, Object> r = AmwajSalesSupport.row(rows[0], DEAL_ROW);
        r.put('isMine', (Id) r.get('ownerId') == AmwajSalesSupport.currentUserId());
        r.put('canEdit', AmwajSalesSupport.canEdit(dealId));
        r.put('customer', customerDetails((Id) r.get('accountId')));
        r.put('eois', eoiRows(new List<Id>{ dealId }, null));
        r.put('reservations', reservationRows(dealId));
        r.put('activities', activities(dealId));
        return r;
    }

    private static final Map<String, String> CUSTOMER_ROW = new Map<String, String>{
        'name' => 'Name',
        'isPersonAccount' => 'IsPersonAccount',
        'fullNameArabic' => 'Full_Name__pc',
        'mobile' => 'PersonMobilePhone',
        'email' => 'PersonEmail',
        'nationalId' => 'NationalID__pc',
        'nationalIdDate' => 'National_ID_Date__pc',
        'residenceId' => 'Residence_ID__pc',
        'residenceIdDate' => 'Residence_ID_Date__pc',
        'city' => 'BillingCity',
        'district' => 'District__pc',
        'neighborhood' => 'Neighborhood__pc',
        'alley' => 'Alley__pc',
        'houseNumber' => 'House_Number__pc'
    };

    /**
     * The person-account details the org's EOI process asks the sales user to
     * confirm. Details the user may not read (e.g. national ID) come back empty
     * and are re-entered on the offer form, as in the org's screen flow.
     */
    private static Map<String, Object> customerDetails(Id accountId) {
        if (accountId == null || !Schema.SObjectType.Account.isAccessible()) {
            return null;
        }
        List<SObject> rows = Database.query(
            'SELECT ' + AmwajSalesSupport.selectList(Account.SObjectType, CUSTOMER_ROW.values()) +
            ' FROM Account WHERE Id = :accountId WITH USER_MODE'
        );
        if (rows.isEmpty()) {
            return null;
        }
        Map<String, Object> c = AmwajSalesSupport.row(rows[0], CUSTOMER_ROW);
        c.put('cityOptions', AmwajSalesSupport.picklist(Lead.City__c));
        return c;
    }

    // ------------------------------------------------------------------ units

    public static Map<String, Object> unitFacets() {
        AmwajSalesSupport.requireReadable(Inventory__c.SObjectType);
        Map<String, String> projectRow = new Map<String, String>{
            'name' => 'Name',
            'status' => 'Status__c',
            'salesDepartment' => 'Sales_Department__c',
            'availableUnits' => 'AvailableUnits__c',
            'totalUnits' => 'TotalUnits__c'
        };
        List<Map<String, Object>> projects = new List<Map<String, Object>>();
        for (SObject p : Database.query(
            'SELECT ' + AmwajSalesSupport.selectList(Project__c.SObjectType, projectRow.values()) +
            ' FROM Project__c WITH USER_MODE ORDER BY Name'
        )) {
            projects.add(AmwajSalesSupport.row(p, projectRow));
        }
        List<Map<String, Object>> zones = new List<Map<String, Object>>();
        if (AmwajSalesSupport.canRead(Inventory__c.SObjectType, 'Zone__c')) {
            for (AggregateResult ar : [
                SELECT Project__c projectId, Zone__c zone
                FROM Inventory__c
                WHERE Zone__c != NULL
                WITH USER_MODE
                GROUP BY Project__c, Zone__c
                ORDER BY Zone__c
            ]) {
                zones.add(new Map<String, Object>{ 'projectId' => ar.get('projectId'), 'zone' => ar.get('zone') });
            }
        }
        // Unit types that actually exist in each project (Unit_Type__c is an independent picklist,
        // so validity per project comes from the inventory itself).
        List<Map<String, Object>> typesByProject = new List<Map<String, Object>>();
        if (AmwajSalesSupport.canRead(Inventory__c.SObjectType, 'Unit_Type__c')) {
            Map<String, Map<String, Object>> byKey = new Map<String, Map<String, Object>>();
            for (AggregateResult ar : [
                SELECT Project__c projectId, Unit_Type__c unitType, Status__c status, COUNT(Id) c
                FROM Inventory__c
                WHERE Unit_Type__c != NULL
                WITH USER_MODE
                GROUP BY Project__c, Unit_Type__c, Status__c
            ]) {
                String key = ar.get('projectId') + '|' + ar.get('unitType');
                if (!byKey.containsKey(key)) {
                    byKey.put(key, new Map<String, Object>{
                        'projectId' => ar.get('projectId'), 'unitType' => ar.get('unitType'), 'available' => 0, 'total' => 0
                    });
                }
                Map<String, Object> entry = byKey.get(key);
                Integer c = (Integer) ar.get('c');
                entry.put('total', (Integer) entry.get('total') + c);
                if (ar.get('status') == 'Available') {
                    entry.put('available', (Integer) entry.get('available') + c);
                }
            }
            typesByProject = byKey.values();
        }
        // Projects with at least one live payment plan (same window as PaymentPlanViewerController).
        Set<Id> projectsWithPlans = new Set<Id>();
        if (Schema.SObjectType.PaymentPlan__c.isAccessible()) {
            for (AggregateResult ar : [
                SELECT Project__c projectId
                FROM PaymentPlan__c
                WHERE IsActive__c = TRUE
                    AND (EffectiveFrom__c = NULL OR EffectiveFrom__c <= TODAY)
                    AND (EffectiveTo__c = NULL OR EffectiveTo__c >= TODAY)
                WITH USER_MODE
                GROUP BY Project__c
            ]) {
                projectsWithPlans.add((Id) ar.get('projectId'));
            }
        }
        for (Map<String, Object> p : projects) {
            p.put('hasPaymentPlans', projectsWithPlans.contains((Id) p.get('id')));
        }
        return new Map<String, Object>{
            'projects' => projects,
            'zones' => zones,
            'typesByProject' => typesByProject,
            'unitTypes' => AmwajSalesSupport.picklist(Inventory__c.Unit_Type__c),
            'statuses' => AmwajSalesSupport.picklist(Inventory__c.Status__c)
        };
    }

    private static final Map<String, String> UNIT_ROW = new Map<String, String>{
        'name' => 'Name',
        'unitCode' => 'UnitCode__c',
        'status' => 'Status__c',
        'unitType' => 'Unit_Type__c',
        'bedrooms' => 'Bedrooms__c',
        'bathrooms' => 'Bathrooms__c',
        'builtUpArea' => 'BuiltUpArea_SQM__c',
        'gardenArea' => 'GardenArea_SQM__c',
        'terraceArea' => 'TerraceArea_SQM__c',
        'plotArea' => 'PlotArea_SQM__c',
        'floor' => 'FloorNumber__c',
        'zone' => 'Zone__c',
        'view' => 'ViewDirection__c',
        'finishing' => 'FinishingStatus__c',
        'listPrice' => 'Unit_Price__c',
        'hasGarden' => 'Has_Garden__c',
        'hasParking' => 'HasParking__c',
        'hasStorage' => 'HasStorage__c',
        'isCorner' => 'IsCorner__c',
        'isPenthouse' => 'IsPenthouse__c',
        'underConstruction' => 'Under_Construction__c',
        'street' => 'Street__c',
        'plotNumber' => 'PlotNumber__c',
        'otherDetails' => 'Other_Details__c',
        'projectId' => 'Project__c',
        'projectName' => 'Project__r.Name',
        'projectStatus' => 'Project__r.Status__c',
        'buildingId' => 'Building__c',
        'buildingName' => 'Building__r.Name'
    };

    public static Map<String, Object> units(Map<String, String> f) {
        AmwajSalesSupport.requireReadable(Inventory__c.SObjectType);
        String projectId = f.get('projectId');
        String status = f.get('status');
        String unitType = f.get('unitType');
        String zone = f.get('zone');
        String term = AmwajSalesSupport.likeTerm(f.get('search'));
        Decimal minBedrooms = toDecimal(f.get('minBedrooms'));
        Decimal minPrice = toDecimal(f.get('minPrice'));
        Decimal maxPrice = toDecimal(f.get('maxPrice'));
        Decimal minArea = toDecimal(f.get('minArea'));
        Decimal pageParam = toDecimal(f.get('page'));
        Integer page = pageParam == null ? 1 : Math.max(1, pageParam.intValue());

        List<String> clauses = new List<String>();
        if (String.isNotBlank(projectId)) {
            clauses.add('Project__c = :projectId');
        }
        if (String.isNotBlank(status)) {
            clauses.add('Status__c = :status');
        } else {
            // Units not yet released are not for sale; they are shown only when asked for explicitly.
            clauses.add('Status__c != \'NotReleased\'');
        }
        if (String.isNotBlank(unitType)) {
            clauses.add('Unit_Type__c = :unitType');
        }
        if (String.isNotBlank(zone)) {
            clauses.add('Zone__c = :zone');
        }
        if (term != null) {
            clauses.add('(Name LIKE :term OR UnitCode__c LIKE :term OR Building__r.Name LIKE :term)');
        }
        if (minBedrooms != null) {
            clauses.add('Bedrooms__c >= :minBedrooms');
        }
        if (minPrice != null) {
            clauses.add('Unit_Price__c >= :minPrice');
        }
        if (maxPrice != null) {
            clauses.add('Unit_Price__c <= :maxPrice');
        }
        if (minArea != null) {
            clauses.add('BuiltUpArea_SQM__c >= :minArea');
        }
        String whereClause = ' WHERE ' + String.join(clauses, ' AND ');
        Integer total = Database.countQuery('SELECT COUNT() FROM Inventory__c' + whereClause + ' WITH USER_MODE');
        Integer pageSize = UNIT_PAGE_SIZE;
        Integer offset = Math.min((page - 1) * UNIT_PAGE_SIZE, 2000);
        List<SObject> rows = Database.query(
            'SELECT ' + AmwajSalesSupport.selectList(Inventory__c.SObjectType, UNIT_ROW.values()) +
            ' FROM Inventory__c' + whereClause +
            ' WITH USER_MODE ORDER BY Project__r.Name, Name LIMIT :pageSize OFFSET :offset'
        );

        Map<Id, List<Map<String, Object>>> mediaByUnit = AmwajMediaService.mediaForUnits(rows);
        List<Map<String, Object>> out = new List<Map<String, Object>>();
        for (SObject u : rows) {
            Map<String, Object> r = AmwajSalesSupport.row(u, UNIT_ROW);
            List<Map<String, Object>> media = mediaByUnit.get(u.Id);
            r.put('coverImage', media == null || media.isEmpty() ? null : media[0]);
            out.add(r);
        }
        return new Map<String, Object>{ 'units' => out, 'total' => total, 'page' => page, 'pageSize' => UNIT_PAGE_SIZE };
    }

    public static Map<String, Object> unitDetail(Id unitId) {
        AmwajSalesSupport.requireReadable(Inventory__c.SObjectType);
        List<SObject> rows = Database.query(
            'SELECT ' + AmwajSalesSupport.selectList(Inventory__c.SObjectType, UNIT_ROW.values()) +
            ' FROM Inventory__c WHERE Id = :unitId WITH USER_MODE'
        );
        if (rows.isEmpty()) {
            throw AmwajSalesException.notFound('This unit was not found or is not shared with you.');
        }
        Map<String, Object> r = AmwajSalesSupport.row(rows[0], UNIT_ROW);
        List<Map<String, Object>> media = AmwajMediaService.mediaForUnits(rows).get(unitId);
        r.put('media', media == null ? new List<Map<String, Object>>() : media);
        // Pricing and plan eligibility come from the org's existing payment-plan logic.
        PaymentPlanViewerController.ViewerDTO pricing = PaymentPlanViewerController.getPaymentPlans(unitId);
        r.put('pricing', pricing);
        r.put('bookingFee', AmwajOfferService.bookingFee(pricing.price?.listPrice));
        r.put('myHold', myHoldOnUnit(unitId));
        return r;
    }

    /** The running user's own live EOI on this unit, if any (other users' holds stay private). */
    private static Map<String, Object> myHoldOnUnit(Id unitId) {
        if (!Schema.SObjectType.EOI__c.isAccessible()) {
            return null;
        }
        Id me = AmwajSalesSupport.currentUserId();
        Set<String> excluded = AmwajSalesSupport.LIVE_EOI_EXCLUDED_STATUSES;
        Map<String, String> holdRow = new Map<String, String>{ 'name' => 'Name', 'status' => 'Status__c', 'expiryDate' => 'ExpiryDate__c' };
        List<SObject> mine = Database.query(
            'SELECT ' + AmwajSalesSupport.selectList(EOI__c.SObjectType, holdRow.values()) +
            ' FROM EOI__c WHERE Inventory__c = :unitId AND Status__c NOT IN :excluded' +
            ' AND (OwnerId = :me OR LinkedOpportunity__r.OwnerId = :me) WITH USER_MODE ORDER BY CreatedDate DESC LIMIT 1'
        );
        return mine.isEmpty() ? null : AmwajSalesSupport.row(mine[0], holdRow);
    }

    // ------------------------------------------------------------------ EOIs

    private static final Map<String, String> EOI_ROW = new Map<String, String>{
        'name' => 'Name',
        'status' => 'Status__c',
        'approvalStatus' => 'Approval_Status__c',
        'discountPct' => 'Discount__c',
        'documentAttached' => 'EOI_Document_Attached__c',
        'expiryDate' => 'ExpiryDate__c',
        'isDue' => 'Due__c',
        'paymentVerified' => 'PaymentVerifiedByFinance__c',
        'paymentVerifiedDate' => 'PaymentVerifiedDate__c',
        'reservationFee' => 'Reservation_Fees__c',
        'netUnitPrice' => 'Unit_Price__c',
        'paymentMethod' => 'Payment_Method__c',
        'customerName' => 'Customer_Name__c',
        'unitId' => 'Inventory__c',
        'unitName' => 'Inventory__r.Name',
        'unitStatus' => 'Inventory__r.Status__c',
        'projectName' => 'Project__r.Name',
        'paymentPlanId' => 'Preferred_Payment_Plan__c',
        'paymentPlanName' => 'Preferred_Payment_Plan__r.Name',
        'dealId' => 'LinkedOpportunity__c',
        'dealName' => 'LinkedOpportunity__r.Name',
        'dealHasReservation' => 'LinkedOpportunity__r.Reservation_Created__c',
        'refundedAmount' => 'RefundedAmount__c',
        'notes' => 'Notes__c',
        'createdDate' => 'CreatedDate',
        'ownerName' => 'Owner.Name'
    };

    private static final Map<String, String> RESERVATION_ROW = new Map<String, String>{
        'name' => 'Name',
        'status' => 'Status__c',
        'holdExpiry' => 'HoldExpiry__c',
        'deposit' => 'DepositAmount__c',
        'depositVerified' => 'DepositVerified__c',
        'netPrice' => 'NetPrice__c',
        'unitName' => 'Inventory__r.Name',
        'eoiName' => 'EOI__r.Name'
    };

    /** EOIs by id, on the given deals, or (both null) every EOI the user owns or sells. */
    public static List<Map<String, Object>> eoiRows(List<Id> dealIds, Id eoiId) {
        AmwajSalesSupport.requireReadable(EOI__c.SObjectType);
        Id me = AmwajSalesSupport.currentUserId();
        String soql =
            'SELECT ' + AmwajSalesSupport.selectList(EOI__c.SObjectType, EOI_ROW.values()) +
            AmwajSalesSupport.childSelect(Reservation__c.SObjectType, 'Reservations__r', RESERVATION_ROW.values(), 'ORDER BY CreatedDate DESC') +
            ' FROM EOI__c WHERE ';
        if (eoiId != null) {
            soql += 'Id = :eoiId';
        } else if (dealIds != null) {
            soql += 'LinkedOpportunity__c IN :dealIds';
        } else {
            soql += '(OwnerId = :me OR LinkedOpportunity__r.OwnerId = :me)';
        }
        soql += ' WITH USER_MODE ORDER BY CreatedDate DESC LIMIT 200';
        List<SObject> rows = Database.query(soql);

        Set<Id> ids = new Set<Id>();
        for (SObject e : rows) {
            ids.add(e.Id);
        }
        Map<Id, List<Map<String, Object>>> filesByEoi = AmwajMediaService.filesFor(ids);
        List<Map<String, Object>> out = new List<Map<String, Object>>();
        for (SObject e : rows) {
            out.add(eoiRow(e, filesByEoi.get(e.Id)));
        }
        return out;
    }

    private static Map<String, Object> eoiRow(SObject e, List<Map<String, Object>> files) {
        Map<String, Object> r = AmwajSalesSupport.row(e, EOI_ROW);
        List<Map<String, Object>> reservations = new List<Map<String, Object>>();
        for (SObject res : AmwajSalesSupport.children(e, 'Reservations__r')) {
            reservations.add(AmwajSalesSupport.row(res, RESERVATION_ROW));
        }
        r.put('reservations', reservations);
        r.put('documents', files == null ? new List<Map<String, Object>>() : files);
        r.put('nextStep', eoiNextStep(r, reservations));
        return r;
    }

    /**
     * Where the EOI sits in the org's process (validation rules and flows on
     * EOI__c / Reservation__c), phrased as the next thing that has to happen.
     */
    public static String eoiNextStep(Map<String, Object> e, List<Map<String, Object>> reservations) {
        String status = (String) e.get('status');
        String approval = (String) e.get('approvalStatus');
        Decimal discount = (Decimal) e.get('discountPct');
        if (status == 'Expired' || status == 'Refunded') {
            return 'CLOSED';
        }
        if (status == 'Submitted') {
            if (discount != null && discount > 0 && approval != 'Approved') {
                return approval == 'Rejected' ? 'DISCOUNT_REJECTED' : 'AWAITING_DISCOUNT_APPROVAL';
            }
            if (e.get('documentAttached') != true) {
                return 'ATTACH_SIGNED_EOI';
            }
            return 'AWAITING_FINANCE';
        }
        if (status == 'Paid') {
            for (Map<String, Object> res : reservations) {
                if (!AmwajSalesSupport.LIVE_RESERVATION_EXCLUDED_STATUSES.contains((String) res.get('status'))) {
                    return 'RESERVED';
                }
            }
            return 'CREATE_RESERVATION';
        }
        return null;
    }

    public static Map<String, Object> eoiDetail(Id eoiId) {
        List<Map<String, Object>> rows = eoiRows(null, eoiId);
        if (rows.isEmpty()) {
            throw AmwajSalesException.notFound('This EOI was not found or is not shared with you.');
        }
        Map<String, Object> r = rows[0];
        r.put('canEdit', AmwajSalesSupport.canEdit(eoiId));
        return r;
    }

    private static List<Map<String, Object>> reservationRows(Id dealId) {
        List<Map<String, Object>> out = new List<Map<String, Object>>();
        if (!Schema.SObjectType.Reservation__c.isAccessible()) {
            return out;
        }
        for (SObject res : Database.query(
            'SELECT ' + AmwajSalesSupport.selectList(Reservation__c.SObjectType, RESERVATION_ROW.values()) +
            ' FROM Reservation__c WHERE Opportunity__c = :dealId WITH USER_MODE ORDER BY CreatedDate DESC'
        )) {
            out.add(AmwajSalesSupport.row(res, RESERVATION_ROW));
        }
        return out;
    }

    // ------------------------------------------------------------------ overview

    public static Map<String, Object> overview() {
        Map<String, Object> out = new Map<String, Object>();
        Map<String, String> sectionErrors = new Map<String, String>();
        Date today = Date.today();

        try {
            out.putAll(leadCounts());
        } catch (Exception e) {
            sectionErrors.put('leads', sectionError(e));
        }
        try {
            out.put('followUps', upcomingFollowUps(today));
        } catch (Exception e) {
            sectionErrors.put('followUps', sectionError(e));
        }
        try {
            out.putAll(holdsAndEois(today));
        } catch (Exception e) {
            sectionErrors.put('eois', sectionError(e));
        }
        try {
            out.put('commission', AmwajCommissionService.forCurrentUser().summary());
        } catch (Exception e) {
            sectionErrors.put('commission', sectionError(e));
        }
        out.put('sectionErrors', sectionErrors);
        return out;
    }

    private static String sectionError(Exception e) {
        if (e instanceof AmwajSalesException) {
            return e.getMessage();
        }
        System.debug(LoggingLevel.ERROR, 'AmwajSalesReadService.overview: ' + e.getTypeName() + ': ' + e.getMessage());
        return e instanceof NoAccessException || e.getMessage().containsIgnoreCase('insufficient')
            ? 'You do not have access to this information.'
            : 'This panel could not be loaded.';
    }

    private static Map<String, Object> leadCounts() {
        Id me = AmwajSalesSupport.currentUserId();
        Map<String, Integer> leadsByStatus = new Map<String, Integer>();
        Integer openLeads = 0;
        if (Schema.SObjectType.Lead.isAccessible()) {
            for (AggregateResult ar : [
                SELECT Status status, COUNT(Id) c
                FROM Lead
                WHERE OwnerId = :me AND IsConverted = false
                WITH USER_MODE
                GROUP BY Status
            ]) {
                leadsByStatus.put((String) ar.get('status'), (Integer) ar.get('c'));
                openLeads += (Integer) ar.get('c');
            }
        }
        return new Map<String, Object>{ 'openLeads' => openLeads, 'leadsByStatus' => leadsByStatus };
    }

    private static List<Map<String, Object>> upcomingFollowUps(Date today) {
        Id me = AmwajSalesSupport.currentUserId();
        List<Map<String, Object>> followUps = new List<Map<String, Object>>();
        if (!AmwajSalesSupport.activitiesEnabled()) {
            return followUps;
        }
        Date horizon = today.addDays(7);
        Map<String, String> followUpRow = new Map<String, String>{
            'subject' => 'Subject',
            'dueDate' => 'ActivityDate',
            'leadId' => 'WhoId',
            'leadName' => 'Who.Name',
            'relatedId' => 'WhatId',
            'relatedName' => 'What.Name'
        };
        for (SObject t : Database.query(
            'SELECT ' + AmwajSalesSupport.selectList(Task.SObjectType, followUpRow.values()) +
            ' FROM Task WHERE OwnerId = :me AND IsClosed = false AND ActivityDate <= :horizon' +
            ' WITH USER_MODE ORDER BY ActivityDate ASC NULLS LAST LIMIT 10'
        )) {
            followUps.add(AmwajSalesSupport.row(t, followUpRow));
        }
        return followUps;
    }

    private static Map<String, Object> holdsAndEois(Date today) {
        List<Map<String, Object>> eois = Schema.SObjectType.EOI__c.isAccessible()
            ? eoiRows(null, null)
            : new List<Map<String, Object>>();
        List<Map<String, Object>> holds = new List<Map<String, Object>>();
        List<Map<String, Object>> awaiting = new List<Map<String, Object>>();
        for (Map<String, Object> e : eois) {
            String step = (String) e.get('nextStep');
            if (step == null || step == 'CLOSED') {
                continue;
            }
            awaiting.add(e);
            if (step != 'RESERVED') {
                holds.add(hold(e, 'EOI', e.get('name'), (Date) e.get('expiryDate'), today));
            }
            for (Object o : (List<Object>) e.get('reservations')) {
                Map<String, Object> res = (Map<String, Object>) o;
                if (res.get('status') == 'Submitted') {
                    holds.add(hold(e, 'RESERVATION', res.get('name'), (Date) res.get('holdExpiry'), today));
                }
            }
        }
        return new Map<String, Object>{ 'holds' => holds, 'eoisAwaitingAction' => awaiting };
    }

    private static Map<String, Object> hold(Map<String, Object> eoi, String type, Object name, Date expiry, Date today) {
        return new Map<String, Object>{
            'eoiId' => eoi.get('id'),
            'name' => name,
            'holdType' => type,
            'customerName' => eoi.get('customerName'),
            'unitName' => eoi.get('unitName'),
            'projectName' => eoi.get('projectName'),
            'holdExpiry' => expiry,
            'isOverdue' => expiry != null && expiry < today,
            'expiresSoon' => expiry != null && expiry <= today.addDays(HOLD_WARNING_DAYS)
        };
    }

    private static Decimal toDecimal(String s) {
        if (String.isBlank(s)) {
            return null;
        }
        try {
            return Decimal.valueOf(s.trim());
        } catch (TypeException e) {
            throw AmwajSalesException.badRequest('"' + s + '" is not a number.');
        }
    }
}
