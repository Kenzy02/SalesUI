/**
 * Data for the EOI document the workspace renders as a PDF, and saving that
 * generated PDF on the EOI.
 *
 * The org has no EOI template (PhiDoc Studio is installed with no templates),
 * so the document is laid out in the app from the saved EOI and its linked
 * records, read in the user's own access. Saving the PDF only adds a file to
 * the EOI: it never sets EOI_Document_Attached__c (signature evidence), the
 * status, the hold or the payment fields.
 */
public with sharing class AmwajEoiDocumentService {
    /** Marks a generated, unsigned copy so it is never mistaken for the signed EOI. */
    public static final String GENERATED_SUFFIX = ' (generated, unsigned)';
    private static final Integer MAX_PDF_BYTES = 4 * 1024 * 1024;

    private static final Map<String, String> EOI_FIELDS = new Map<String, String>{
        'name' => 'Name',
        'status' => 'Status__c',
        'createdDate' => 'CreatedDate',
        'expiryDate' => 'ExpiryDate__c',
        'discountPct' => 'Discount__c',
        'approvalStatus' => 'Approval_Status__c',
        'discountOnReservation' => 'Skip_Discount_Approval__c',
        'bookingFee' => 'Reservation_Fees__c',
        'paymentVerified' => 'PaymentVerifiedByFinance__c',
        'signedDocumentOnFile' => 'EOI_Document_Attached__c',
        'paymentMethod' => 'Payment_Method__c',
        'paymentPlanName' => 'Preferred_Payment_Plan__r.Name',
        'accountId' => 'PersonAccount__c',
        'dealAccountId' => 'LinkedOpportunity__r.AccountId',
        'dealName' => 'LinkedOpportunity__r.Name',
        'ownerId' => 'OwnerId',
        'ownerName' => 'Owner.Name',
        'createdByName' => 'Submitter_Name__c',
        'unitName' => 'Inventory__r.Name',
        'unitCode' => 'Inventory__r.UnitCode__c',
        'unitType' => 'Inventory__r.Unit_Type__c',
        'floor' => 'Inventory__r.FloorNumber__c',
        'area' => 'Inventory__r.BuiltUpArea_SQM__c',
        'bedrooms' => 'Inventory__r.Bedrooms__c',
        'listPrice' => 'Inventory__r.Unit_Price__c',
        'buildingName' => 'Inventory__r.Building__r.Name',
        'buildingNameAr' => 'Inventory__r.Building__r.Name_Ar__c',
        'projectName' => 'Project__r.Name',
        'projectNameAr' => 'Project__r.Name_Ar__c',
        'projectCode' => 'Project__r.ProjectCode__c'
    };

    private static final Map<String, String> CUSTOMER_FIELDS = new Map<String, String>{
        'name' => 'Name',
        'fullNameArabic' => 'Full_Name__pc',
        'nationalId' => 'NationalID__pc',
        'nationalIdDate' => 'National_ID_Date__pc',
        'residenceId' => 'Residence_ID__pc',
        'residenceIdDate' => 'Residence_ID_Date__pc',
        'governorate' => 'BillingCity',
        'district' => 'District__pc',
        'neighborhood' => 'Neighborhood__pc',
        'alley' => 'Alley__pc',
        'houseNumber' => 'House_Number__pc',
        'mobile' => 'PersonMobilePhone',
        'phone2' => 'Phone',
        'email' => 'PersonEmail'
    };

    public static Map<String, Object> documentData(Id eoiId) {
        AmwajSalesSupport.requireReadable(EOI__c.SObjectType);
        List<SObject> rows = Database.query(
            'SELECT ' + AmwajSalesSupport.selectList(EOI__c.SObjectType, EOI_FIELDS.values()) +
            ' FROM EOI__c WHERE Id = :eoiId WITH USER_MODE'
        );
        if (rows.isEmpty()) {
            throw AmwajSalesException.notFound('This EOI was not found or is not shared with you.');
        }
        SObject e = rows[0];
        Map<String, Object> eoi = AmwajSalesSupport.row(e, EOI_FIELDS);
        eoi.put('unitTypeLabel', label(Inventory__c.Unit_Type__c, (String) eoi.get('unitType')));
        eoi.put('paymentMethodLabel', label(EOI__c.Payment_Method__c, (String) eoi.get('paymentMethod')));
        eoi.put('statusLabel', label(EOI__c.Status__c, (String) eoi.get('status')));

        Id accountId = (Id) (eoi.get('accountId') != null ? eoi.get('accountId') : eoi.get('dealAccountId'));
        Map<String, Object> out = new Map<String, Object>{
            'eoi' => eoi,
            'customer' => customer(accountId),
            'salesManagerName' => managerName((Id) eoi.get('ownerId')),
            'canSave' => canSave(eoiId)
        };
        return out;
    }

    /** Adds the generated PDF to the EOI's files. Nothing on the EOI record changes. */
    public static Map<String, Object> saveGenerated(Id eoiId, String fileName, String base64Body) {
        if (eoiId == null || String.isBlank(fileName) || String.isBlank(base64Body)) {
            throw AmwajSalesException.badRequest('The generated PDF is missing.');
        }
        if (!fileName.toLowerCase().endsWith('.pdf')) {
            throw AmwajSalesException.badRequest('Only the generated EOI PDF can be saved here.');
        }
        Blob body;
        try {
            body = EncodingUtil.base64Decode(base64Body);
        } catch (Exception ex) {
            throw AmwajSalesException.badRequest('The PDF could not be read. Generate it again.');
        }
        // "%PDF-" is "JVBERi0" in base64.
        if (body.size() > MAX_PDF_BYTES || !base64Body.startsWith('JVBERi0')) {
            throw AmwajSalesException.badRequest('The generated PDF could not be saved. Generate it again.');
        }
        List<EOI__c> eois = [SELECT Id, Name FROM EOI__c WHERE Id = :eoiId WITH USER_MODE];
        if (eois.isEmpty()) {
            throw AmwajSalesException.notFound('This EOI was not found or is not shared with you.');
        }
        if (!canSave(eoiId)) {
            throw AmwajSalesException.forbidden('Your Salesforce access does not allow adding files to EOI ' + eois[0].Name + '.');
        }
        ContentVersion v = new ContentVersion(
            Title = fileName.substringBeforeLast('.') + GENERATED_SUFFIX,
            PathOnClient = fileName,
            VersionData = body,
            Description = 'Generated by the Amwaj Sales Workspace from the saved EOI. Unsigned: not signature evidence.',
            FirstPublishLocationId = eoiId
        );
        Database.insert(v, AccessLevel.USER_MODE);
        return new Map<String, Object>{ 'versionId' => v.Id, 'title' => v.Title };
    }

    /** Same rule as filing the signed EOI: the user can edit the EOI and create files. */
    private static Boolean canSave(Id eoiId) {
        return Schema.SObjectType.EOI__c.isUpdateable() && Schema.SObjectType.ContentVersion.isCreateable() && AmwajSalesSupport.canEdit(eoiId);
    }

    private static Map<String, Object> customer(Id accountId) {
        if (accountId == null || !Schema.SObjectType.Account.isAccessible()) {
            return null;
        }
        List<SObject> rows = Database.query(
            'SELECT ' + AmwajSalesSupport.selectList(Account.SObjectType, CUSTOMER_FIELDS.values()) +
            ' FROM Account WHERE Id = :accountId WITH USER_MODE'
        );
        return rows.isEmpty() ? null : AmwajSalesSupport.row(rows[0], CUSTOMER_FIELDS);
    }

    /** The EOI owner's manager as recorded on the user (no name is invented when none is set). */
    private static String managerName(Id ownerId) {
        if (ownerId == null || ownerId.getSobjectType() != User.SObjectType || !AmwajSalesSupport.canRead(User.SObjectType, 'Manager.Name')) {
            return null;
        }
        List<User> users = [SELECT Manager.Name FROM User WHERE Id = :ownerId WITH USER_MODE];
        return users.isEmpty() || users[0].Manager == null ? null : users[0].Manager.Name;
    }

    private static String label(Schema.SObjectField field, String value) {
        if (value == null) {
            return null;
        }
        for (Schema.PicklistEntry p : field.getDescribe().getPicklistValues()) {
            if (p.getValue() == value) {
                return p.getLabel();
            }
        }
        return value;
    }
}
