/**
 * Shared helpers for the Amwaj sales workspace services.
 *
 * Read pattern used by every service: build the SELECT list from the fields
 * the running user can read (selectList), query WITH USER_MODE (object access,
 * field-level security and record sharing all apply), and read values through
 * val(), which returns null for anything that was not selected.
 */
public with sharing class AmwajSalesSupport {
    public static final Set<String> LIVE_EOI_EXCLUDED_STATUSES = new Set<String>{ 'Expired', 'Refunded', 'Rejected' };
    public static final Set<String> LIVE_RESERVATION_EXCLUDED_STATUSES = new Set<String>{ 'Cancelled', 'Terminated' };

    private static Map<Schema.SObjectType, Map<String, Schema.DescribeFieldResult>> fieldsByType =
        new Map<Schema.SObjectType, Map<String, Schema.DescribeFieldResult>>();
    private static Map<Schema.SObjectType, Map<String, Schema.DescribeFieldResult>> relationshipsByType =
        new Map<Schema.SObjectType, Map<String, Schema.DescribeFieldResult>>();

    public static Id currentUserId() {
        return UserInfo.getUserId();
    }

    /** "Id, a, b.c" - the given field paths the running user can read, always starting with Id. */
    public static String selectList(Schema.SObjectType root, List<String> paths) {
        List<String> keep = new List<String>{ 'Id' };
        for (String p : paths) {
            if (p != 'Id' && canRead(root, p)) {
                keep.add(p);
            }
        }
        return String.join(keep, ', ');
    }

    /** A child sub-query ", (SELECT ... FROM rel ...)" or '' when the child object is not readable. */
    public static String childSelect(Schema.SObjectType childType, String relationshipName, List<String> paths, String tail) {
        if (!childType.getDescribe().isAccessible()) {
            return '';
        }
        return ', (SELECT ' + selectList(childType, paths) + ' FROM ' + relationshipName + ' ' + tail + ')';
    }

    /** True when every hop of a path such as 'Project__r.Name' is readable by the running user. */
    public static Boolean canRead(Schema.SObjectType root, String path) {
        Schema.SObjectType cur = root;
        List<String> parts = path.split('\\.');
        for (Integer i = 0; i < parts.size(); i++) {
            if (cur == null) {
                // Polymorphic lookup (Owner, Who, What): the lookup itself was checked; Name is universal.
                return parts[i] == 'Name';
            }
            if (!cur.getDescribe().isAccessible()) {
                return false;
            }
            Boolean last = i == parts.size() - 1;
            Schema.DescribeFieldResult f = last ? describeField(cur, parts[i]) : describeRelationship(cur, parts[i]);
            if (f == null || !f.isAccessible()) {
                return false;
            }
            if (!last) {
                List<Schema.SObjectType> refs = f.getReferenceTo();
                cur = refs.size() == 1 ? refs[0] : null;
            }
        }
        return true;
    }

    private static Schema.DescribeFieldResult describeField(Schema.SObjectType t, String name) {
        cacheDescribe(t);
        return fieldsByType.get(t).get(name.toLowerCase());
    }

    private static Schema.DescribeFieldResult describeRelationship(Schema.SObjectType t, String relationshipName) {
        cacheDescribe(t);
        return relationshipsByType.get(t).get(relationshipName.toLowerCase());
    }

    private static void cacheDescribe(Schema.SObjectType t) {
        if (fieldsByType.containsKey(t)) {
            return;
        }
        Map<String, Schema.DescribeFieldResult> fields = new Map<String, Schema.DescribeFieldResult>();
        Map<String, Schema.DescribeFieldResult> relationships = new Map<String, Schema.DescribeFieldResult>();
        for (Schema.SObjectField sf : t.getDescribe().fields.getMap().values()) {
            Schema.DescribeFieldResult d = sf.getDescribe();
            fields.put(d.getName().toLowerCase(), d);
            if (d.getRelationshipName() != null) {
                relationships.put(d.getRelationshipName().toLowerCase(), d);
            }
        }
        fieldsByType.put(t, fields);
        relationshipsByType.put(t, relationships);
    }

    /** Throws 403 unless the running user can read the object. */
    public static void requireReadable(Schema.SObjectType objectType) {
        if (!objectType.getDescribe().isAccessible()) {
            throw AmwajSalesException.forbidden(
                'You do not have access to ' + objectType.getDescribe().getLabelPlural() + '.'
            );
        }
    }

    /**
     * Value at a field path such as 'Project__r.Name'. Returns null when any part
     * is empty or was not selected (e.g. not readable by the user).
     */
    public static Object val(SObject rec, String path) {
        SObject cur = rec;
        List<String> parts = path.split('\\.');
        for (Integer i = 0; i < parts.size(); i++) {
            if (cur == null) {
                return null;
            }
            Map<String, Object> populated = cur.getPopulatedFieldsAsMap();
            Object value = populated.get(parts[i]);
            if (value == null) {
                return null;
            }
            if (i == parts.size() - 1) {
                return value;
            }
            cur = (SObject) value;
        }
        return null;
    }

    public static String str(SObject rec, String path) {
        Object v = val(rec, path);
        return v == null ? null : String.valueOf(v);
    }

    public static Decimal num(SObject rec, String path) {
        Object v = val(rec, path);
        return v == null ? null : (Decimal) v;
    }

    public static Boolean bool(SObject rec, String path) {
        Object v = val(rec, path);
        return v == null ? false : (Boolean) v;
    }

    /** Children of a relationship sub-query, tolerating a missing or stripped relationship. */
    public static List<SObject> children(SObject rec, String relationshipName) {
        Object v = rec.getPopulatedFieldsAsMap().get(relationshipName);
        return v == null ? new List<SObject>() : (List<SObject>) v;
    }

    /**
     * Follow-up activities need read access to the Task fields that tie a task to
     * a lead or deal and give it a due date. (In this org the Sales Executive
     * profile and permission set do not grant them, so reps get a clear message.)
     */
    public static Boolean activitiesEnabled() {
        return Schema.SObjectType.Task.isAccessible() && Schema.SObjectType.Task.isCreateable() &&
            canRead(Task.SObjectType, 'WhoId') && canRead(Task.SObjectType, 'WhatId') &&
            canRead(Task.SObjectType, 'ActivityDate');
    }

    /** True when the running user can edit the record (record sharing + object permissions). */
    public static Boolean canEdit(Id recordId) {
        List<UserRecordAccess> access = [
            SELECT RecordId, HasEditAccess
            FROM UserRecordAccess
            WHERE UserId = :UserInfo.getUserId() AND RecordId = :recordId
            WITH SYSTEM_MODE
        ];
        return !access.isEmpty() && access[0].HasEditAccess;
    }

    /** Active picklist values as {value, label} for a field. */
    public static List<Map<String, String>> picklist(Schema.SObjectField field) {
        List<Map<String, String>> options = new List<Map<String, String>>();
        for (Schema.PicklistEntry e : field.getDescribe().getPicklistValues()) {
            if (e.isActive()) {
                options.add(new Map<String, String>{ 'value' => e.getValue(), 'label' => e.getLabel() });
            }
        }
        return options;
    }

    /** Org-wide sales settings (hierarchy custom setting used by the org's flows). */
    public static PackageSettings__c settings() {
        PackageSettings__c s = PackageSettings__c.getOrgDefaults();
        return s == null ? new PackageSettings__c() : s;
    }

    /** A contains-pattern for a LIKE bind variable; the user's own % and _ match literally. */
    public static String likeTerm(String term) {
        if (String.isBlank(term)) {
            return null;
        }
        return '%' + term.trim().replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%';
    }

    public static Map<String, Object> row(SObject rec, Map<String, String> fieldsByKey) {
        Map<String, Object> out = new Map<String, Object>{ 'id' => rec.Id };
        for (String key : fieldsByKey.keySet()) {
            out.put(key, val(rec, fieldsByKey.get(key)));
        }
        return out;
    }
}
