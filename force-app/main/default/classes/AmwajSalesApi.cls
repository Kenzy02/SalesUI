/**
 * REST entry point for the SalesUI React app: /services/apexrest/amwaj/sales/v1/...
 *
 * The app calls it through @salesforce/platform-sdk (authenticated session,
 * CSRF token). Identity always comes from the session (UserInfo); the API
 * never accepts an owner or user id from the client.
 *
 *   GET   me | overview | leads | leads/{id} | leads/{id}/conversion | deals | deals/{id}
 *         units/facets | units | units/{id} | eois | eois/{id} | commission | files/{versionId}
 *   PATCH leads/{id}
 *   POST  leads/{id}/activities | leads/{id}/matches | leads/{id}/convert | deals/{id}/activities
 *         activities/{id}/complete | eois | eois/{id}/document | reservations
 */
@RestResource(urlMapping='/amwaj/sales/v1/*')
global with sharing class AmwajSalesApi {
    private static final String BASE = '/amwaj/sales/v1/';

    @HttpGet
    global static void doGet() {
        handle('GET');
    }

    @HttpPost
    global static void doPost() {
        handle('POST');
    }

    @HttpPatch
    global static void doPatch() {
        handle('PATCH');
    }

    private static void handle(String method) {
        RestRequest req = RestContext.request;
        RestResponse res = RestContext.response;
        try {
            Object body = route(method, segments(req.requestURI), req);
            if (body instanceof AmwajMediaService.Download) {
                AmwajMediaService.Download file = (AmwajMediaService.Download) body;
                res.statusCode = 200;
                res.addHeader('Content-Type', file.contentType);
                res.addHeader('Cache-Control', 'private, max-age=300');
                res.responseBody = file.body;
                return;
            }
            respond(res, 200, body);
        } catch (AmwajSalesException e) {
            respond(res, e.statusCode, error(e.getMessage()));
        } catch (DmlException e) {
            respond(res, 400, error(e.getDmlMessage(0)));
        } catch (NoAccessException e) {
            respond(res, 403, error('You do not have permission to do that.'));
        } catch (System.SecurityException e) {
            respond(res, 403, error('You do not have permission to do that.'));
        } catch (QueryException e) {
            if (e.getMessage().containsIgnoreCase('insufficient access')) {
                respond(res, 403, error('You do not have permission to see that.'));
            } else {
                respond(res, 500, unexpected(e));
            }
        } catch (JSONException e) {
            respond(res, 400, error('The request could not be read.'));
        } catch (Exception e) {
            respond(res, 500, unexpected(e));
        }
    }

    @TestVisible
    private static Object route(String method, List<String> s, RestRequest req) {
        String head = s.isEmpty() ? '' : s[0];
        Integer n = s.size();
        if (method == 'GET') {
            switch on head {
                when 'me' {
                    return AmwajSalesReadService.me();
                }
                when 'overview' {
                    return AmwajSalesReadService.overview();
                }
                when 'leads' {
                    if (n == 3 && s[2] == 'conversion') {
                        return AmwajLeadConversionService.review(idAt(s, 1));
                    }
                    return n == 1
                        ? AmwajSalesReadService.leads(req.params.get('status'), req.params.get('search'), req.params.get('projectId'))
                        : AmwajSalesReadService.leadDetail(idAt(s, 1));
                }
                when 'deals' {
                    return n == 1 ? AmwajSalesReadService.deals(req.params.get('search'), req.params.get('projectId')) : AmwajSalesReadService.dealDetail(idAt(s, 1));
                }
                when 'units' {
                    if (n == 1) {
                        return AmwajSalesReadService.units(req.params);
                    }
                    return s[1] == 'facets' ? AmwajSalesReadService.unitFacets() : AmwajSalesReadService.unitDetail(idAt(s, 1));
                }
                when 'eois' {
                    return n == 1
                        ? (Object) new Map<String, Object>{ 'eois' => AmwajSalesReadService.eoiRows(null, null) }
                        : AmwajSalesReadService.eoiDetail(idAt(s, 1));
                }
                when 'commission' {
                    return AmwajCommissionService.forCurrentUser();
                }
                when 'files' {
                    return AmwajMediaService.download(idAt(s, 1));
                }
            }
        } else if (method == 'PATCH') {
            if (head == 'leads' && n == 2) {
                return AmwajLeadService.updateLead(idAt(s, 1), (AmwajLeadService.LeadUpdate) parse(req, AmwajLeadService.LeadUpdate.class));
            }
        } else if (method == 'POST') {
            if ((head == 'leads' || head == 'deals') && n == 3 && s[2] == 'activities') {
                return AmwajLeadService.addActivity(
                    idAt(s, 1),
                    (AmwajLeadService.ActivityRequest) parse(req, AmwajLeadService.ActivityRequest.class)
                );
            }
            if (head == 'leads' && n == 3 && s[2] == 'matches') {
                Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(bodyOf(req));
                return AmwajLeadConversionService.matches(idAt(s, 1), (String) body.get('mobile'), (String) body.get('nationalId'));
            }
            if (head == 'leads' && n == 3 && s[2] == 'convert') {
                return AmwajLeadConversionService.convert(
                    idAt(s, 1),
                    (AmwajLeadConversionService.ConvertRequest) parse(req, AmwajLeadConversionService.ConvertRequest.class)
                );
            }
            if (head == 'activities' && n == 3 && s[2] == 'complete') {
                return AmwajLeadService.completeActivity(idAt(s, 1));
            }
            if (head == 'eois' && n == 1) {
                return AmwajOfferService.createEoi((AmwajOfferService.OfferRequest) parse(req, AmwajOfferService.OfferRequest.class));
            }
            if (head == 'eois' && n == 3 && s[2] == 'document') {
                Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(bodyOf(req));
                return AmwajOfferService.attachSignedEoi(idAt(s, 1), (String) body.get('fileName'), (String) body.get('base64'));
            }
            if (head == 'reservations' && n == 1) {
                return AmwajOfferService.createReservation(
                    (AmwajOfferService.ReservationRequest) parse(req, AmwajOfferService.ReservationRequest.class)
                );
            }
        }
        throw AmwajSalesException.notFound('Unknown request: ' + method + ' ' + String.join(s, '/'));
    }

    @TestVisible
    private static List<String> segments(String uri) {
        String path = uri == null ? '' : uri.substringBefore('?');
        Integer i = path.indexOf(BASE);
        path = i < 0 ? '' : path.substring(i + BASE.length());
        List<String> out = new List<String>();
        for (String part : path.split('/')) {
            if (String.isNotBlank(part)) {
                out.add(EncodingUtil.urlDecode(part, 'UTF-8'));
            }
        }
        return out;
    }

    private static Id idAt(List<String> s, Integer index) {
        if (s.size() <= index) {
            throw AmwajSalesException.badRequest('A record id is missing from the request.');
        }
        try {
            return Id.valueOf(s[index]);
        } catch (Exception e) {
            throw AmwajSalesException.badRequest('"' + s[index] + '" is not a valid record id.');
        }
    }

    private static String bodyOf(RestRequest req) {
        if (req.requestBody == null || req.requestBody.size() == 0) {
            throw AmwajSalesException.badRequest('The request body is empty.');
        }
        return req.requestBody.toString();
    }

    private static Object parse(RestRequest req, System.Type t) {
        return JSON.deserialize(bodyOf(req), t);
    }

    private static Map<String, Object> error(String message) {
        return new Map<String, Object>{ 'error' => message };
    }

    private static void respond(RestResponse res, Integer status, Object body) {
        res.statusCode = status;
        res.addHeader('Content-Type', 'application/json');
        res.responseBody = Blob.valueOf(JSON.serialize(body, true));
    }

    /** Logs the technical detail; users only see a generic message (tests see the detail). */
    private static Map<String, Object> unexpected(Exception e) {
        String detail = e.getTypeName() + ': ' + e.getMessage() + '\n' + e.getStackTraceString();
        System.debug(LoggingLevel.ERROR, 'AmwajSalesApi: ' + detail);
        return error(Test.isRunningTest() ? detail : 'Something went wrong. Please try again.');
    }
}
