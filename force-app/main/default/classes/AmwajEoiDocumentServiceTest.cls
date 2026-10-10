/**
 * EOI document data and saving the generated PDF: read in the user's access,
 * never another rep's EOI, and saving never touches the EOI record.
 */
@IsTest
private class AmwajEoiDocumentServiceTest {
    private static final String PDF = EncodingUtil.base64Encode(Blob.valueOf('%PDF-1.7 generated'));

    @TestSetup
    static void setup() {
        AmwajSalesTestData.createBaseline();
    }

    private static Id createEoiAsRep(Decimal discountPct) {
        Opportunity deal = AmwajSalesTestData.deal('Hassan');
        AmwajOfferService.OfferRequest req = AmwajSalesTestData.offer(
            deal.Id,
            AmwajSalesTestData.unitNamed('AW-U-002').Id,
            AmwajSalesTestData.plan('AW-1090').Id
        );
        req.discountPct = discountPct;
        Id eoiId;
        System.runAs(AmwajSalesTestData.rep('rep1')) {
            eoiId = (Id) AmwajOfferService.createEoi(req).get('eoiId');
        }
        return eoiId;
    }

    @IsTest
    static void documentDataComesFromTheSavedEoiAndCustomer() {
        Id eoiId = createEoiAsRep(0);
        Test.startTest();
        System.runAs(AmwajSalesTestData.rep('rep1')) {
            Map<String, Object> data = AmwajEoiDocumentService.documentData(eoiId);
            Map<String, Object> eoi = (Map<String, Object>) data.get('eoi');
            Map<String, Object> customer = (Map<String, Object>) data.get('customer');
            Assert.isNotNull(eoi.get('name'));
            Assert.areEqual('AW-U-002', eoi.get('unitName'));
            Assert.areEqual(AmwajSalesTestData.LIST_PRICE, (Decimal) eoi.get('listPrice'));
            Assert.areEqual(AmwajSalesTestData.LIST_PRICE * 0.015, (Decimal) eoi.get('bookingFee'));
            Assert.areEqual(false, eoi.get('signedDocumentOnFile'));
            Assert.areEqual('عمر حسن', customer.get('fullNameArabic'));
            Assert.areEqual('199012345678', customer.get('nationalId'));
            Assert.areEqual('Baghdad', customer.get('governorate'));
            Assert.areEqual('905', customer.get('neighborhood'));
            Assert.areEqual(false, data.get('canSave'), 'Sales reps cannot edit EOIs, so saving is not offered');
        }
        System.runAs(AmwajSalesTestData.rep('rep2')) {
            try {
                AmwajEoiDocumentService.documentData(eoiId);
                Assert.fail('Another rep must not see the EOI');
            } catch (AmwajSalesException e) {
                Assert.areEqual(404, e.statusCode);
            }
        }
        Test.stopTest();
    }

    @IsTest
    static void savingTheGeneratedPdfLeavesTheEoiUnchanged() {
        Id eoiId = createEoiAsRep(0);
        EOI__c before = [
            SELECT Status__c, ExpiryDate__c, EOI_Document_Attached__c, PaymentVerifiedByFinance__c, Approval_Status__c
            FROM EOI__c WHERE Id = :eoiId
        ];
        Integer eoiCount = [SELECT COUNT() FROM EOI__c];
        Test.startTest();
        System.runAs(AmwajSalesTestData.rep('rep1')) {
            try {
                AmwajEoiDocumentService.saveGenerated(eoiId, 'Amwaj-EOI-X.pdf', PDF);
                Assert.fail('Reps cannot add files to EOIs');
            } catch (AmwajSalesException e) {
                Assert.areEqual(403, e.statusCode);
            }
        }
        // As a user with edit access to EOIs (finance / contracts), the test admin.
        try {
            AmwajEoiDocumentService.saveGenerated(eoiId, 'notes.txt', PDF);
            Assert.fail('Only PDFs');
        } catch (AmwajSalesException e) {
            Assert.areEqual(400, e.statusCode);
        }
        try {
            AmwajEoiDocumentService.saveGenerated(eoiId, 'fake.pdf', EncodingUtil.base64Encode(Blob.valueOf('not a pdf')));
            Assert.fail('Only real PDFs');
        } catch (AmwajSalesException e) {
            Assert.areEqual(400, e.statusCode);
        }
        Map<String, Object> saved = AmwajEoiDocumentService.saveGenerated(eoiId, 'Amwaj-EOI-X.pdf', PDF);
        Test.stopTest();

        Assert.areEqual('Amwaj-EOI-X' + AmwajEoiDocumentService.GENERATED_SUFFIX, saved.get('title'));
        Assert.areEqual(1, [SELECT COUNT() FROM ContentDocumentLink WHERE LinkedEntityId = :eoiId]);
        EOI__c after = [
            SELECT Status__c, ExpiryDate__c, EOI_Document_Attached__c, PaymentVerifiedByFinance__c, Approval_Status__c
            FROM EOI__c WHERE Id = :eoiId
        ];
        Assert.areEqual(before, after, 'Status, hold, signature evidence and payment are unchanged');
        Assert.isFalse(after.EOI_Document_Attached__c);
        Assert.areEqual(eoiCount, [SELECT COUNT() FROM EOI__c], 'No EOI is created');
    }

    @IsTest
    static void requestedDiscountIsReportedWithItsApprovalStatus() {
        Id eoiId = createEoiAsRep(2);
        Test.startTest();
        Map<String, Object> eoi = (Map<String, Object>) AmwajEoiDocumentService.documentData(eoiId).get('eoi');
        Test.stopTest();
        Assert.areEqual(2, (Decimal) eoi.get('discountPct'), 'Whole percent, as entered');
        Assert.areNotEqual('Approved', eoi.get('approvalStatus'), 'A requested discount is not approved on creation');
    }
}
