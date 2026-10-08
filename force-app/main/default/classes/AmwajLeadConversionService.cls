/**
 * Lead conversion for the sales workspace, so a sales user can go from a lead
 * to an EOI without leaving the app.
 *
 * Uses Salesforce's own lead conversion (Database.convertLead) in the user's
 * context, so the org's conversion setup applies unchanged: ConvertLeads
 * permission, object and field access, sharing, the Lead Convert field
 * mappings (Lead -> person account / deal), the converted lead status, the
 * record-triggered flows (deal naming) and the validation rules, including
 * Convert_Must_Use_Linked_Buyer and the Account national ID / mobile rules.
 * Nothing about conversion is imitated here.
 *
 * Org specifics this class follows (verified in the AmwajReact sandbox):
 *  - Customers are person accounts. Native conversion creates a person account
 *    only when Lead.Company is blank; the org's leads carry the placeholder
 *    Company "Individual", which would create a business account named
 *    "Individual". The placeholder is cleared on the lead, in the same
 *    transaction, right before conversion. A lead with a real company name is
 *    not converted here (the EOI process needs a person account).
 *  - Existing customers are found with the org's own duplicate check, the
 *    Get_Duplicate_Leads_SubFlow (mobile, phone or national ID), the same one
 *    Lead Quick Create uses. Standard duplicate rules are inactive in the org.
 *    A lead linked to a buyer (Buyer__c) must convert into that account.
 *  - Converted leads cannot be edited, so Buyer__c can only be recorded when
 *    converting into an existing customer. New deals get OriginatingLead__c
 *    (lead attribution on the deal, picked up again on the EOI); Salesforce
 *    rejects a user-mode lookup to a converted lead, so that one field is
 *    written in system mode.
 *
 * Safe to retry: the lead row is locked before converting, and a lead that is
 * already converted is answered with its resulting customer and deal instead of
 * being converted again.
 */
public with sharing class AmwajLeadConversionService {
    /** The placeholder company the org's leads use for private buyers. */
    @TestVisible
    private static final String INDIVIDUAL_COMPANY = 'Individual';
    private static final String DUPLICATE_FLOW = 'Get_Duplicate_Leads_SubFlow';
    @TestVisible
    private static final String DUPLICATE_CUSTOMER =
        'Another customer in Salesforce already has this mobile number or national ID. ' +
        'Choose that customer from the matches instead of creating a new one.';

    public class ConvertRequest {
        public String firstName;
        public String lastName;
        public String mobile;
        public String email;
        public String nationalId;
        /** An existing customer from the review's matches, or null to create a new customer. */
        public Id accountId;
        /** An open deal of that customer to continue with, or null to create a new deal. */
        public Id dealId;
    }

    // ================================================================= review

    /** What the conversion review screen needs: the lead, blockers, and existing-customer matches. */
    public static Map<String, Object> review(Id leadId) {
        Lead l = visibleLead(leadId);
        if (l.IsConverted) {
            return resolved(l, true);
        }
        List<String> blockers = blockers(l);
        Map<String, Object> out = new Map<String, Object>{
            'leadId' => l.Id,
            'converted' => false,
            'firstName' => l.FirstName,
            'lastName' => l.LastName,
            'mobile' => l.MobilePhone,
            'email' => l.Email,
            'nationalId' => l.NationalID__c,
            'company' => l.Company,
            'projectInterest' => l.Project_Interest__r?.Name,
            'interestedUnit' => l.Interested_Unit__r?.Name,
            'linkedBuyerId' => l.Buyer__c,
            'convertedStatus' => convertedStatus(),
            'blockers' => blockers,
            'canConvert' => blockers.isEmpty(),
            'canEditNationalId' => Schema.SObjectType.Lead.fields.NationalID__c.isUpdateable()
        };
        Matches m = findMatches(l.MobilePhone, l.NationalID__c, l.Buyer__c, l.Id);
        out.put('matches', m.accounts);
        out.put('duplicateLeads', m.leads);
        return out;
    }

    /** Matches for details the user has corrected on the review form (same rules as review). */
    public static Map<String, Object> matches(Id leadId, String mobile, String nationalId) {
        Lead l = visibleLead(leadId);
        Matches m = findMatches(
            String.isBlank(mobile) ? l.MobilePhone : mobile.trim(),
            String.isBlank(nationalId) ? l.NationalID__c : nationalId.trim(),
            l.Buyer__c,
            l.Id
        );
        return new Map<String, Object>{ 'matches' => m.accounts, 'duplicateLeads' => m.leads };
    }

    // ================================================================= convert

    public static Map<String, Object> convert(Id leadId, ConvertRequest req) {
        if (req == null) {
            throw AmwajSalesException.badRequest('Confirm the customer details.');
        }
        visibleLead(leadId);
        // Serialises double submits and two tabs: the second request waits here, then sees the converted lead.
        Lead l = SYSTEM_QUERIES.lockLead(leadId);
        if (l.IsConverted) {
            return resolved(l, true);
        }
        List<String> blockers = blockers(l);
        if (!blockers.isEmpty()) {
            throw AmwajSalesException.forbidden(blockers[0]);
        }
        validate(req);

        Id accountId = l.Buyer__c;
        if (accountId != null && req.accountId != null && req.accountId != accountId) {
            throw AmwajSalesException.badRequest(
                'This lead is linked to an existing customer (' + l.Buyer__r?.Name + '). It can only be converted into that customer.'
            );
        }
        if (accountId == null && req.accountId != null) {
            // Only a customer the org's duplicate check matched (on the stored or corrected details) can be chosen.
            Set<Id> allowed = new Set<Id>();
            for (Map<String, Object> m : findMatches(l.MobilePhone, l.NationalID__c, null, l.Id).accounts) {
                allowed.add((Id) m.get('id'));
            }
            for (Map<String, Object> m : findMatches(req.mobile.trim(), trimToNull(req.nationalId), null, l.Id).accounts) {
                allowed.add((Id) m.get('id'));
            }
            if (!allowed.contains(req.accountId)) {
                throw AmwajSalesException.badRequest('That customer does not match this lead. Review the matches and try again.');
            }
            accountId = req.accountId;
        }
        if (accountId != null) {
            requireUsableAccount(accountId);
        }
        if (req.dealId != null) {
            requireUsableDeal(req.dealId, accountId);
        }

        Savepoint sp = Database.setSavepoint();
        try {
            prepareLead(l, req, accountId);

            Database.LeadConvert lc = new Database.LeadConvert();
            lc.setLeadId(l.Id);
            lc.setConvertedStatus(convertedStatus());
            if (accountId != null) {
                // Person account: only the account is given; Salesforce links its person contact.
                lc.setAccountId(accountId);
            }
            if (req.dealId != null) {
                lc.setDoNotCreateOpportunity(true);
            }
            Database.LeadConvertResult r = Database.convertLead(
                new List<Database.LeadConvert>{ lc },
                false,
                AccessLevel.USER_MODE
            )[0];
            if (!r.isSuccess()) {
                Database.rollback(sp);
                throw AmwajSalesException.badRequest(conversionMessage(r.getErrors()));
            }
            Id dealId = req.dealId != null ? req.dealId : r.getOpportunityId();
            if (req.dealId == null && Schema.SObjectType.Opportunity.fields.OriginatingLead__c.isUpdateable()) {
                // The user may set this field, but Salesforce blocks users from pointing a lookup at a
                // converted lead, so the attribution is written in system mode, on the deal just created.
                SYSTEM_WRITES.setOriginatingLead(dealId, l.Id);
            }
            Map<String, Object> out = result(l.Id, r.getAccountId(), dealId, false);
            out.put('createdCustomer', accountId == null);
            out.put('createdDeal', req.dealId == null);
            return out;
        } catch (DmlException e) {
            Database.rollback(sp);
            throw AmwajSalesException.badRequest(
                e.getDmlType(0) == StatusCode.DUPLICATE_VALUE ? DUPLICATE_CUSTOMER : e.getDmlMessage(0)
            );
        }
    }

    /** Corrected contact details, the placeholder company cleared, and the chosen buyer recorded. */
    private static void prepareLead(Lead l, ConvertRequest req, Id accountId) {
        Lead upd = new Lead(Id = l.Id);
        Boolean changed = false;
        Map<Schema.SObjectField, Object> values = new Map<Schema.SObjectField, Object>{
            Lead.FirstName => trimToNull(req.firstName),
            Lead.LastName => req.lastName.trim(),
            Lead.MobilePhone => req.mobile.trim(),
            Lead.Email => trimToNull(req.email)
        };
        if (Schema.SObjectType.Lead.fields.NationalID__c.isUpdateable()) {
            values.put(Lead.NationalID__c, trimToNull(req.nationalId));
        }
        for (Schema.SObjectField f : values.keySet()) {
            if (l.get(f) != values.get(f)) {
                upd.put(f, values.get(f));
                changed = true;
            }
        }
        if (isIndividual(l.Company) && l.Company != null) {
            upd.Company = null;
            changed = true;
        }
        if (accountId != null && l.Buyer__c == null) {
            upd.Buyer__c = accountId;
            changed = true;
        }
        if (changed) {
            Database.update(upd, AccessLevel.USER_MODE);
        }
    }

    // ================================================================= already converted

    /** The customer and deal a converted lead produced, plus what the user may continue with. */
    private static Map<String, Object> resolved(Lead l, Boolean replayed) {
        Id dealId = l.ConvertedOpportunityId;
        if (dealId == null && l.ConvertedAccountId != null) {
            // Converted without a new deal (into an existing deal, or elsewhere): use the only open deal the user can continue.
            List<Id> usable = new List<Id>();
            for (Opportunity o : [
                SELECT Id, EOI_Created__c
                FROM Opportunity
                WHERE AccountId = :l.ConvertedAccountId AND IsClosed = FALSE
                WITH USER_MODE
                ORDER BY CreatedDate DESC
                LIMIT 20
            ]) {
                if (AmwajSalesSupport.canEdit(o.Id)) {
                    usable.add(o.Id);
                }
            }
            if (usable.size() == 1) {
                dealId = usable[0];
            }
        }
        return result(l.Id, l.ConvertedAccountId, dealId, replayed);
    }

    private static Map<String, Object> result(Id leadId, Id accountId, Id dealId, Boolean replayed) {
        Map<String, Object> out = new Map<String, Object>{
            'leadId' => leadId,
            'converted' => true,
            'replayed' => replayed,
            'accountId' => accountId,
            'dealId' => dealId
        };
        if (accountId != null) {
            List<Account> a = [SELECT Name FROM Account WHERE Id = :accountId WITH USER_MODE];
            out.put('customerName', a.isEmpty() ? null : a[0].Name);
        }
        if (dealId != null) {
            List<Opportunity> o = [
                SELECT Name, IsClosed, EOI_Created__c, Project__r.Name
                FROM Opportunity
                WHERE Id = :dealId
                WITH USER_MODE
            ];
            if (o.isEmpty()) {
                out.put('dealId', null);
            } else {
                out.put('dealName', o[0].Name);
                out.put('dealProject', o[0].Project__r?.Name);
                out.put('dealIsClosed', o[0].IsClosed);
                out.put('dealHasEoi', o[0].EOI_Created__c);
                out.put('canContinue', !o[0].IsClosed && o[0].EOI_Created__c != true && AmwajSalesSupport.canEdit(dealId));
            }
        }
        return out;
    }

    // ================================================================= checks

    private static Lead visibleLead(Id leadId) {
        if (leadId == null || leadId.getSObjectType() != Lead.SObjectType) {
            throw AmwajSalesException.badRequest('Choose a lead.');
        }
        List<Lead> rows = [
            SELECT Id, FirstName, LastName, MobilePhone, Email, NationalID__c, Company, IsConverted, ConvertedAccountId,
                ConvertedOpportunityId, Buyer__c, Buyer__r.Name, Project_Interest__r.Name, Interested_Unit__r.Name
            FROM Lead
            WHERE Id = :leadId
            WITH USER_MODE
        ];
        if (rows.isEmpty()) {
            throw AmwajSalesException.notFound('This lead was not found or is not shared with you.');
        }
        return rows[0];
    }

    /** Reasons the user cannot convert this lead here; empty when conversion may go ahead. */
    private static List<String> blockers(Lead l) {
        List<String> out = new List<String>();
        if (!hasConvertLeadsPermission()) {
            out.add('Your Salesforce access does not include converting leads. Ask your administrator.');
        } else if (!Schema.SObjectType.Account.isCreateable() || !Schema.SObjectType.Opportunity.isCreateable()) {
            out.add('Your Salesforce access does not allow creating customers and deals.');
        } else if (!AmwajSalesSupport.canEdit(l.Id)) {
            out.add('Only the lead owner (or someone above them) can convert this lead.');
        } else if (!isIndividual(l.Company)) {
            out.add(
                'This lead is recorded for the company "' + l.Company + '". Bookings are made for individual buyers ' +
                '(person accounts), so it cannot be converted here. Ask your sales admin how to handle company buyers.'
            );
        }
        return out;
    }

    @TestVisible
    private static Boolean isIndividual(String company) {
        return String.isBlank(company) || company.trim().equalsIgnoreCase(INDIVIDUAL_COMPANY);
    }

    private static Boolean hasConvertLeadsPermission() {
        Id me = UserInfo.getUserId();
        return [
            SELECT COUNT()
            FROM PermissionSetAssignment
            WHERE AssigneeId = :me AND PermissionSet.PermissionsConvertLeads = TRUE
            WITH SYSTEM_MODE
        ] > 0;
    }

    private static void validate(ConvertRequest req) {
        if (String.isBlank(req.lastName)) {
            throw AmwajSalesException.badRequest('Enter the customer\'s last name.');
        }
        if (String.isBlank(req.mobile)) {
            throw AmwajSalesException.badRequest('Enter the customer\'s mobile number.');
        }
        if (!AmwajOfferService.isValidMobile(req.mobile.trim())) {
            throw AmwajSalesException.badRequest(
                'An Iraqi mobile must start with 075, 077, 078 or 079 and be exactly 11 digits. ' +
                'An international number must start with + or 00 and be 12 to 16 characters long.'
            );
        }
        String nid = trimToNull(req.nationalId);
        if (nid != null && (nid.length() != 12 || !nid.isNumeric())) {
            throw AmwajSalesException.badRequest('The national ID must be exactly 12 digits, or left empty.');
        }
        if (req.dealId != null && req.accountId == null) {
            throw AmwajSalesException.badRequest('Choose the existing customer whose deal you want to continue.');
        }
    }

    private static void requireUsableAccount(Id accountId) {
        List<Account> rows = [SELECT Id, Name, IsPersonAccount FROM Account WHERE Id = :accountId WITH USER_MODE];
        if (rows.isEmpty()) {
            throw AmwajSalesException.notFound('That customer was not found or is not shared with you.');
        }
        if (!rows[0].IsPersonAccount) {
            throw AmwajSalesException.conflict(rows[0].Name + ' is not an individual customer, so the lead cannot be converted into it.');
        }
        if (!AmwajSalesSupport.canEdit(accountId)) {
            throw AmwajSalesException.forbidden('You are not allowed to update ' + rows[0].Name + '.');
        }
    }

    private static void requireUsableDeal(Id dealId, Id accountId) {
        List<Opportunity> rows = [
            SELECT Id, Name, AccountId, IsClosed, EOI_Created__c
            FROM Opportunity
            WHERE Id = :dealId
            WITH USER_MODE
        ];
        if (rows.isEmpty() || rows[0].AccountId != accountId) {
            throw AmwajSalesException.badRequest('That deal does not belong to the chosen customer.');
        }
        if (rows[0].IsClosed || rows[0].EOI_Created__c == true || !AmwajSalesSupport.canEdit(dealId)) {
            throw AmwajSalesException.conflict('Deal ' + rows[0].Name + ' cannot take a new EOI. Create a new deal instead.');
        }
    }

    private static String convertedStatus() {
        List<LeadStatus> s = [
            SELECT ApiName
            FROM LeadStatus
            WHERE IsConverted = TRUE
            WITH SYSTEM_MODE
            ORDER BY IsDefault DESC, SortOrder
            LIMIT 1
        ];
        if (s.isEmpty()) {
            throw AmwajSalesException.conflict('No converted lead status is set up in Salesforce.');
        }
        return s[0].ApiName;
    }

    /** Salesforce's conversion errors are already worded for users; validation errors lose their prefix. */
    private static String conversionMessage(List<Database.Error> errors) {
        if (errors == null || errors.isEmpty()) {
            return 'The lead could not be converted.';
        }
        if (errors[0].getStatusCode() == StatusCode.DUPLICATE_VALUE) {
            return DUPLICATE_CUSTOMER;
        }
        String m = errors[0].getMessage();
        return m.contains(': ') && m.startsWith('Validation error on') ? m.substringAfter(': ') : m;
    }

    // ================================================================= existing-customer matches

    private class Matches {
        List<Map<String, Object>> accounts = new List<Map<String, Object>>();
        List<Map<String, Object>> leads = new List<Map<String, Object>>();
    }

    /**
     * Customers matching the lead by the org's duplicate check, limited to
     * person accounts the user can see. The lead's linked buyer is always listed
     * (and marked) because the org requires converting into it.
     */
    private static Matches findMatches(String mobile, String nationalId, Id buyerId, Id leadId) {
        Matches out = new Matches();
        Map<Id, Set<String>> reasons = new Map<Id, Set<String>>();
        Set<Id> otherLeadIds = new Set<Id>();
        if (String.isNotBlank(mobile) || String.isNotBlank(nationalId)) {
            Flow.Interview check = Flow.Interview.createInterview(
                DUPLICATE_FLOW,
                new Map<String, Object>{ 'Input_Mobile' => trimToNull(mobile), 'NationalID_Input' => trimToNull(nationalId) }
            );
            check.start();
            List<Account> accounts = (List<Account>) check.getVariableValue('DuplicateAccounts_Coll');
            for (Account a : accounts == null ? new List<Account>() : accounts) {
                reasons.put(a.Id, new Set<String>());
            }
            List<Lead> leads = (List<Lead>) check.getVariableValue('Duplicate_Leads_Coll_Output');
            for (Lead d : leads == null ? new List<Lead>() : leads) {
                if (d.Id != leadId) {
                    otherLeadIds.add(d.Id);
                }
            }
        }
        // The org blocks a second customer with the same mobile at the database level (unique
        // Account.Mobile_Normalized__c), so match on that canonical form too (e.g. 0770... = +964770...).
        String canonical = canonicalMobile(mobile);
        if (canonical != null) {
            for (Account a : SYSTEM_QUERIES.accountsByNormalizedMobile(canonical)) {
                reasons.put(a.Id, new Set<String>());
            }
        }
        if (buyerId != null && !reasons.containsKey(buyerId)) {
            reasons.put(buyerId, new Set<String>());
        }

        if (!reasons.isEmpty() && Schema.SObjectType.Account.isAccessible()) {
            List<Id> ids = new List<Id>(reasons.keySet());
            String soql =
                'SELECT ' +
                AmwajSalesSupport.selectList(
                    Account.SObjectType,
                    new List<String>{ 'Name', 'IsPersonAccount', 'PersonMobilePhone', 'Phone', 'NationalID__pc', 'Owner.Name' }
                ) +
                AmwajSalesSupport.childSelect(
                    Opportunity.SObjectType,
                    'Opportunities',
                    new List<String>{ 'Name', 'StageName', 'EOI_Created__c', 'Project__r.Name', 'Owner.Name' },
                    'WHERE IsClosed = false ORDER BY CreatedDate DESC LIMIT 20'
                ) +
                ' FROM Account WHERE Id IN :ids WITH USER_MODE ORDER BY Name';
            for (SObject a : Database.query(soql)) {
                if (AmwajSalesSupport.bool(a, 'IsPersonAccount') != true) {
                    continue;
                }
                Map<String, Object> row = AmwajSalesSupport.row(
                    a,
                    new Map<String, String>{ 'name' => 'Name', 'mobile' => 'PersonMobilePhone', 'ownerName' => 'Owner.Name' }
                );
                List<String> matchedOn = new List<String>();
                if (canonical != null && canonical == canonicalMobile(AmwajSalesSupport.str(a, 'PersonMobilePhone'))) {
                    matchedOn.add('mobile');
                } else if (canonical != null && canonical == canonicalMobile(AmwajSalesSupport.str(a, 'Phone'))) {
                    matchedOn.add('phone');
                }
                String nid = AmwajSalesSupport.str(a, 'NationalID__pc');
                if (nationalId != null && nid != null && nationalId.trim() == nid) {
                    matchedOn.add('national ID');
                }
                row.put('nationalIdEnding', nid == null ? null : nid.right(4));
                row.put('matchedOn', matchedOn);
                // Mobile and national ID are unique per customer in the org: a new customer with them would be refused.
                row.put('blocksNewCustomer', matchedOn.contains('mobile') || matchedOn.contains('national ID'));
                row.put('isLinkedBuyer', a.Id == buyerId);
                row.put('canUse', AmwajSalesSupport.canEdit(a.Id));
                List<Map<String, Object>> deals = new List<Map<String, Object>>();
                for (SObject o : AmwajSalesSupport.children(a, 'Opportunities')) {
                    Map<String, Object> d = AmwajSalesSupport.row(
                        o,
                        new Map<String, String>{
                            'name' => 'Name',
                            'stage' => 'StageName',
                            'projectName' => 'Project__r.Name',
                            'ownerName' => 'Owner.Name',
                            'hasEoi' => 'EOI_Created__c'
                        }
                    );
                    d.put('canUse', AmwajSalesSupport.bool(o, 'EOI_Created__c') != true && AmwajSalesSupport.canEdit(o.Id));
                    deals.add(d);
                }
                row.put('openDeals', deals);
                out.accounts.add(row);
            }
        }

        if (!otherLeadIds.isEmpty()) {
            List<Id> ids = new List<Id>(otherLeadIds);
            for (Lead d : [SELECT Id, Name, Status, Owner.Name FROM Lead WHERE Id IN :ids WITH USER_MODE LIMIT 20]) {
                out.leads.add(new Map<String, Object>{ 'id' => d.Id, 'name' => d.Name, 'status' => d.Status, 'ownerName' => d.Owner?.Name });
            }
        }
        return out;
    }

    private static String trimToNull(String s) {
        return String.isBlank(s) ? null : s.trim();
    }

    /** Same canonical form as the Mobile_Canonical formula in the org's Account before-save flow. */
    @TestVisible
    private static String canonicalMobile(String raw) {
        String m = trimToNull(raw);
        if (m == null) {
            return null;
        }
        if (m.startsWith('+')) {
            return m;
        }
        if (m.startsWith('00')) {
            return '+' + m.substring(2);
        }
        if (m.startsWith('0')) {
            return '+964' + m.substring(1);
        }
        return null;
    }

    // ================================================================= system-mode helpers

    private static final SystemQueries SYSTEM_QUERIES = new SystemQueries();
    private static final SystemWrites SYSTEM_WRITES = new SystemWrites();

    /** The lock is taken in system mode, only after visibleLead() confirmed the user can see the lead. */
    private without sharing class SystemQueries {
        /** Ids only; what the user may see of these accounts is re-read in user mode. */
        List<Account> accountsByNormalizedMobile(String canonical) {
            return [SELECT Id FROM Account WHERE Mobile_Normalized__c = :canonical WITH SYSTEM_MODE LIMIT 5];
        }

        Lead lockLead(Id leadId) {
            return [
                SELECT Id, FirstName, LastName, MobilePhone, Email, NationalID__c, Company, IsConverted, ConvertedAccountId,
                    ConvertedOpportunityId, Buyer__c, Buyer__r.Name
                FROM Lead
                WHERE Id = :leadId
                WITH SYSTEM_MODE
                FOR UPDATE
            ];
        }
    }

    private without sharing class SystemWrites {
        void setOriginatingLead(Id dealId, Id leadId) {
            Database.update(new Opportunity(Id = dealId, OriginatingLead__c = leadId), AccessLevel.SYSTEM_MODE);
        }
    }
}
