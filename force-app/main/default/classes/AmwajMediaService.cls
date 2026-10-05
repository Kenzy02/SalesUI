/**
 * Salesforce Files for the sales workspace: unit imagery (files linked to the
 * unit, its building or its project) and documents on EOIs.
 *
 * Files stay private: they are listed through ContentDocumentLink under the
 * running user's sharing and streamed through the authenticated API by
 * download(). Nothing is made public.
 *
 * Convention (the org has no media yet): an image whose title contains
 * "floor plan" / "floorplan" / "floor-plan" is shown as a floor plan; every
 * other image is gallery imagery.
 */
public with sharing class AmwajMediaService {
    private static final Set<String> IMAGE_TYPES = new Set<String>{ 'PNG', 'JPG', 'JPEG', 'GIF', 'WEBP' };
    // Files are returned inside a synchronous Apex response (6 MB heap).
    private static final Integer MAX_DOWNLOAD_BYTES = 4 * 1024 * 1024;

    /** Unit id -> media, ordered unit images first, then building, then project. */
    public static Map<Id, List<Map<String, Object>>> mediaForUnits(List<SObject> units) {
        Map<Id, List<Map<String, Object>>> out = new Map<Id, List<Map<String, Object>>>();
        if (units == null || units.isEmpty() || !Schema.SObjectType.ContentDocumentLink.isAccessible()) {
            return out;
        }
        Set<Id> entityIds = new Set<Id>();
        for (SObject u : units) {
            entityIds.add(u.Id);
            addIfPresent(entityIds, AmwajSalesSupport.val(u, 'Building__c'));
            addIfPresent(entityIds, AmwajSalesSupport.val(u, 'Project__c'));
        }
        Map<Id, List<Map<String, Object>>> byEntity = linkedFiles(entityIds, true);
        for (SObject u : units) {
            List<Map<String, Object>> media = new List<Map<String, Object>>();
            appendWithSource(media, byEntity.get(u.Id), 'unit');
            appendWithSource(media, byEntity.get((Id) AmwajSalesSupport.val(u, 'Building__c')), 'building');
            appendWithSource(media, byEntity.get((Id) AmwajSalesSupport.val(u, 'Project__c')), 'project');
            out.put(u.Id, media);
        }
        return out;
    }

    /** Record id -> every file (any type) linked to it. */
    public static Map<Id, List<Map<String, Object>>> filesFor(Set<Id> recordIds) {
        if (recordIds == null || recordIds.isEmpty() || !Schema.SObjectType.ContentDocumentLink.isAccessible()) {
            return new Map<Id, List<Map<String, Object>>>();
        }
        return linkedFiles(recordIds, false);
    }

    private static Map<Id, List<Map<String, Object>>> linkedFiles(Set<Id> entityIds, Boolean imagesOnly) {
        Map<Id, List<Map<String, Object>>> byEntity = new Map<Id, List<Map<String, Object>>>();
        entityIds.remove(null);
        if (entityIds.isEmpty()) {
            return byEntity;
        }
        for (ContentDocumentLink link : [
            SELECT LinkedEntityId, ContentDocument.Title, ContentDocument.FileType, ContentDocument.ContentSize,
                ContentDocument.LatestPublishedVersionId, ContentDocument.CreatedDate
            FROM ContentDocumentLink
            WHERE LinkedEntityId IN :entityIds
            WITH USER_MODE
            ORDER BY ContentDocument.CreatedDate ASC
        ]) {
            String fileType = link.ContentDocument.FileType == null ? '' : link.ContentDocument.FileType.toUpperCase();
            Boolean isImage = IMAGE_TYPES.contains(fileType);
            if (imagesOnly && !isImage) {
                continue;
            }
            if (!byEntity.containsKey(link.LinkedEntityId)) {
                byEntity.put(link.LinkedEntityId, new List<Map<String, Object>>());
            }
            String title = link.ContentDocument.Title;
            byEntity.get(link.LinkedEntityId).add(
                new Map<String, Object>{
                    'versionId' => link.ContentDocument.LatestPublishedVersionId,
                    'title' => title,
                    'fileType' => fileType,
                    'size' => link.ContentDocument.ContentSize,
                    'createdDate' => link.ContentDocument.CreatedDate,
                    'isImage' => isImage,
                    'kind' => isImage ? (isFloorPlan(title) ? 'floorplan' : 'image') : 'document'
                }
            );
        }
        return byEntity;
    }

    @TestVisible
    private static Boolean isFloorPlan(String title) {
        if (String.isBlank(title)) {
            return false;
        }
        String t = title.toLowerCase().replace('-', ' ').replace('_', ' ');
        return t.contains('floor plan') || t.contains('floorplan');
    }

    /** File body for an image/document the running user can already see. */
    public static Download download(Id versionId) {
        List<ContentVersion> versions = [
            SELECT Id, Title, FileType, FileExtension, ContentSize, VersionData
            FROM ContentVersion
            WHERE Id = :versionId
            WITH USER_MODE
            LIMIT 1
        ];
        if (versions.isEmpty()) {
            throw AmwajSalesException.notFound('This file was not found or is not shared with you.');
        }
        ContentVersion v = versions[0];
        if (v.ContentSize > MAX_DOWNLOAD_BYTES) {
            throw AmwajSalesException.badRequest('This file is too large to preview here. Open it in Salesforce instead.');
        }
        Download d = new Download();
        d.body = v.VersionData;
        d.contentType = mimeType(v.FileType);
        d.fileName = v.Title + (String.isBlank(v.FileExtension) ? '' : '.' + v.FileExtension);
        return d;
    }

    @TestVisible
    private static String mimeType(String fileType) {
        switch on (fileType == null ? '' : fileType.toUpperCase()) {
            when 'PNG' {
                return 'image/png';
            }
            when 'JPG', 'JPEG' {
                return 'image/jpeg';
            }
            when 'GIF' {
                return 'image/gif';
            }
            when 'WEBP' {
                return 'image/webp';
            }
            when 'PDF' {
                return 'application/pdf';
            }
            when else {
                return 'application/octet-stream';
            }
        }
    }

    private static void appendWithSource(List<Map<String, Object>> target, List<Map<String, Object>> files, String source) {
        if (files == null) {
            return;
        }
        for (Map<String, Object> f : files) {
            Map<String, Object> copy = f.clone();
            copy.put('source', source);
            target.add(copy);
        }
    }

    private static void addIfPresent(Set<Id> ids, Object value) {
        if (value != null) {
            ids.add((Id) value);
        }
    }

    public class Download {
        public Blob body;
        public String contentType;
        public String fileName;
    }
}
