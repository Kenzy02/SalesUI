/**
 * A business error raised by the Amwaj sales workspace services. Carries the
 * HTTP status the REST layer should answer with and a message that is safe to
 * show to a sales user as-is.
 */
public with sharing class AmwajSalesException extends Exception {
    public Integer statusCode = 400;

    public static AmwajSalesException of(Integer statusCode, String message) {
        AmwajSalesException e = new AmwajSalesException(message);
        e.statusCode = statusCode;
        return e;
    }

    public static AmwajSalesException badRequest(String message) {
        return of(400, message);
    }

    public static AmwajSalesException forbidden(String message) {
        return of(403, message);
    }

    public static AmwajSalesException notFound(String message) {
        return of(404, message);
    }

    /** The request conflicts with the current state of a record (e.g. unit already held). */
    public static AmwajSalesException conflict(String message) {
        return of(409, message);
    }
}
