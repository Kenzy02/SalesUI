/**
 * Lead follow-up actions for the sales workspace. Every write runs in user
 * mode, so object permissions, field-level security, sharing and the org's
 * Lead validation rules (e.g. Reception_CallCentre_No_Status_Change) apply
 * exactly as they do in Salesforce.
 */
public with sharing class AmwajLeadService {
    public class LeadUpdate {
        public String status;
        public String rating;
        public String description;
    }

    public class ActivityRequest {
        /** CALL = log a completed call; FOLLOW_UP = schedule an open task. */
        public String kind;
        public String subject;
        public String comments;
        public Date dueDate;
    }

    public static Map<String, Object> updateLead(Id leadId, LeadUpdate req) {
        if (req == null) {
            throw AmwajSalesException.badRequest('Nothing to update.');
        }
        Lead l = new Lead(Id = leadId);
        Boolean changed = false;
        if (req.status != null) {
            l.Status = req.status;
            changed = true;
        }
        if (req.rating != null) {
            l.Rating = String.isBlank(req.rating) ? null : req.rating;
            changed = true;
        }
        if (req.description != null) {
            l.Description = req.description;
            changed = true;
        }
        if (!changed) {
            throw AmwajSalesException.badRequest('Nothing to update.');
        }
        try {
            Database.update(l, AccessLevel.USER_MODE);
        } catch (DmlException e) {
            throw AmwajSalesException.badRequest(e.getDmlMessage(0));
        }
        return AmwajSalesReadService.leadDetail(leadId);
    }

    /** Logs a call or schedules a follow-up on a lead or a deal the user can see. */
    public static Map<String, Object> addActivity(Id parentId, ActivityRequest req) {
        if (req == null || String.isBlank(req.subject)) {
            throw AmwajSalesException.badRequest('Add a short subject for the activity.');
        }
        if (!AmwajSalesSupport.activitiesEnabled()) {
            throw AmwajSalesException.forbidden(
                'Your Salesforce access does not include follow-up activities. Ask your administrator to enable them.'
            );
        }
        Schema.SObjectType parentType = parentId.getSObjectType();
        if (parentType != Lead.SObjectType && parentType != Opportunity.SObjectType) {
            throw AmwajSalesException.badRequest('Activities can be added to leads and deals only.');
        }
        if (!AmwajSalesSupport.canEdit(parentId)) {
            throw AmwajSalesException.forbidden('You can only add activities to records you are allowed to edit.');
        }
        Task t = new Task(
            OwnerId = UserInfo.getUserId(),
            Subject = req.subject.trim().left(255),
            Description = req.comments
        );
        if (parentType == Lead.SObjectType) {
            t.WhoId = parentId;
        } else {
            t.WhatId = parentId;
        }
        if (req.kind == 'CALL') {
            t.TaskSubtype = 'Call';
            t.Status = 'Completed';
            t.ActivityDate = Date.today();
        } else if (req.kind == 'FOLLOW_UP') {
            if (req.dueDate == null) {
                throw AmwajSalesException.badRequest('Choose when to follow up.');
            }
            t.TaskSubtype = 'Task';
            t.Status = 'Not Started';
            t.ActivityDate = req.dueDate;
        } else {
            throw AmwajSalesException.badRequest('Choose whether to log a call or schedule a follow-up.');
        }
        try {
            Database.insert(t, AccessLevel.USER_MODE);
        } catch (DmlException e) {
            throw AmwajSalesException.badRequest(e.getDmlMessage(0));
        }
        return new Map<String, Object>{ 'activities' => AmwajSalesReadService.activities(parentId) };
    }

    public static Map<String, Object> completeActivity(Id taskId) {
        try {
            Database.update(new Task(Id = taskId, Status = 'Completed'), AccessLevel.USER_MODE);
        } catch (DmlException e) {
            throw AmwajSalesException.badRequest(e.getDmlMessage(0));
        }
        return new Map<String, Object>{ 'id' => taskId, 'status' => 'Completed' };
    }
}
