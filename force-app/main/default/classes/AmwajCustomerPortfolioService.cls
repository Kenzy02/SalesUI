/**
 * Customer portfolio for the sales workspace: one entry per customer
 * (Account / person account id), combining every deal, EOI, reservation and
 * refund on that customer that the running user can see.
 *
 * Every read is WITH USER_MODE with field lists filtered to readable fields, so
 * sharing, object permissions and field-level security all apply; records the
 * user can't see are simply not counted (and the customer is flagged when the
 * deal says such records exist). Money is reconciled by AmwajPaymentLedger.
 *
 * "My customers" = customers on deals the user owns. The whole list is built
 * from a fixed number of queries (no query per customer), and totals cover the
 * complete matching set.
 */
public with sharing class AmwajCustomerPortfolioService {
    private static final Integer MAX_ROWS = 2000;

    private static final Map<String, String> ACCOUNT_ROW = new Map<String, String>{
        'name' => 'Name',
        'mobile' => 'PersonMobilePhone',
        'phone' => 'Phone',
        'email' => 'PersonEmail'
    };

    private static final Map<String, String> DEAL_ROW = new Map<String, String>{
        'name' => 'Name',
        'stage' => 'StageName',
        'isClosed' => 'IsClosed',
        'accountId' => 'AccountId',
        'projectId' => 'Project__c',
        'projectName' => 'Project__r.Name',
        'ownerId' => 'OwnerId',
        'ownerName' => 'Owner.Name',
        'eoiCreated' => 'EOI_Created__c',
        'reservationCreated' => 'Reservation_Created__c'
    };

    private static final Map<String, String> EOI_ROW = new Map<String, String>{
        'name' => 'Name',
        'status' => 'Status__c',
        'approvalStatus' => 'Approval_Status__c',
        'dealId' => 'LinkedOpportunity__c',
        'accountId' => 'PersonAccount__c',
        'unitId' => 'Inventory__c',
        'unitName' => 'Inventory__r.Name',
        'unitStatus' => 'Inventory__r.Status__c',
        'projectId' => 'Project__c',
        'projectName' => 'Project__r.Name',
        'bookingFee' => 'Reservation_Fees__c',
        'paymentVerified' => 'PaymentVerifiedByFinance__c',
        'paymentVerifiedDate' => 'PaymentVerifiedDate__c',
        'documentAttached' => 'EOI_Document_Attached__c',
        'expiryDate' => 'ExpiryDate__c',
        'offerPrice' => 'Unit_Price__c',
        'discountPct' => 'Discount__c',
        'paymentMethod' => 'Payment_Method__c',
        'paymentPlanName' => 'Preferred_Payment_Plan__r.Name',
        'refundedAmount' => 'RefundedAmount__c',
        'refundedDate' => 'RefundedDate__c',
        'createdDate' => 'CreatedDate'
    };

    private static final Map<String, String> RESERVATION_ROW = new Map<String, String>{
        'name' => 'Name',
        'status' => 'Status__c',
        'eoiId' => 'EOI__c',
        'dealId' => 'Opportunity__c',
        'accountId' => 'PersonAccount__c',
        'unitId' => 'Inventory__c',
        'unitName' => 'Inventory__r.Name',
        'unitStatus' => 'Inventory__r.Status__c',
        'projectId' => 'Inventory__r.Project__c',
        'projectName' => 'Inventory__r.Project__r.Name',
        'holdExpiry' => 'HoldExpiry__c',
        'listPrice' => 'ListPrice__c',
        'discountPct' => 'Discount__c',
        'netPrice' => 'NetPrice__c',
        'deposit' => 'DepositAmount__c',
        'depositVerified' => 'DepositVerified__c',
        'depositVerifiedDate' => 'DepositVerifiedDate__c',
        'saleDate' => 'ActivationDate__c',
        'cancelledDate' => 'CancelledDate__c',
        'paymentPlanName' => 'PaymentPlan__r.Name',
        'createdDate' => 'CreatedDate'
    };

    private static final Map<String, String> REFUND_ROW = new Map<String, String>{
        'name' => 'Name',
        'status' => 'Status__c',
        'eoiId' => 'EOI__c',
        'reservationId' => 'Reservation__c',
        'approvedAmount' => 'ApprovedAmount__c',
        'requestedAmount' => 'RequestedAmount__c',
        'processedDate' => 'RefundProcessedDate__c'
    };

    /** Fields without which confirmed payments can't be worked out; unreadable = "not available", never zero. */
    private static final List<String> EOI_MONEY_FIELDS = new List<String>{ 'Reservation_Fees__c', 'PaymentVerifiedByFinance__c' };
    private static final List<String> RESERVATION_MONEY_FIELDS = new List<String>{ 'DepositAmount__c', 'DepositVerified__c' };

    /** One unit for one customer: an EOI and its reservations, or a reservation without a visible EOI. */
    private class UnitLine {
        String key;
        Id accountId;
        Id dealId;
        SObject eoi;
        List<SObject> reservations = new List<SObject>();
        List<SObject> refunds = new List<SObject>();
    }

    private class Dataset {
        Map<Id, SObject> accounts = new Map<Id, SObject>();
        Map<Id, SObject> deals = new Map<Id, SObject>();
        Map<Id, List<SObject>> dealsByAccount = new Map<Id, List<SObject>>();
        Map<String, UnitLine> lines = new Map<String, UnitLine>();
        Boolean truncated = false;
    }

    // ------------------------------------------------------------------ API

    public static Map<String, Object> customers(String search, String projectId) {
        AmwajSalesSupport.requireReadable(Opportunity.SObjectType);
        AmwajSalesSupport.requireReadable(Account.SObjectType);
        if (String.isNotBlank(projectId) && !(((Object) projectId) instanceof Id)) {
            throw AmwajSalesException.badRequest('"' + projectId + '" is not a valid project id.');
        }
        Id me = AmwajSalesSupport.currentUserId();
        Set<Id> accountIds = new Set<Id>();
        for (AggregateResult ar : [
            SELECT AccountId a
            FROM Opportunity
            WHERE OwnerId = :me AND AccountId != NULL
            WITH USER_MODE
            GROUP BY AccountId
            LIMIT :MAX_ROWS
        ]) {
            accountIds.add((Id) ar.get('a'));
        }
        Dataset data = load(accountIds);
        data.truncated = data.truncated || accountIds.size() >= MAX_ROWS;

        String term = String.isBlank(search) ? null : search.trim().toLowerCase();
        List<Map<String, Object>> cards = new List<Map<String, Object>>();
        Map<String, Object> totals = new Map<String, Object>{
            'customers' => 0, 'sold' => 0, 'reserved' => 0, 'eoiHold' => 0, 'confirmedPaid' => 0, 'pendingConfirmation' => 0
        };
        Map<Id, List<UnitLine>> linesByAccount = linesByAccount(data);
        for (Id accountId : data.accounts.keySet()) {
            if (!matches(data, accountId, linesByAccount.get(accountId), term, projectId)) {
                continue;
            }
            Map<String, Object> card = summarize(data, accountId, linesByAccount.get(accountId), false);
            cards.add(card);
            Map<String, Object> counts = (Map<String, Object>) card.get('counts');
            Map<String, Object> money = (Map<String, Object>) card.get('payments');
            totals.put('customers', (Integer) totals.get('customers') + 1);
            for (String k : new List<String>{ 'sold', 'reserved', 'eoiHold' }) {
                totals.put(k, (Integer) totals.get(k) + (Integer) counts.get(k));
            }
            for (String k : new List<String>{ 'confirmedPaid', 'pendingConfirmation' }) {
                totals.put(k, money.get(k) == null || totals.get(k) == null ? null : (Decimal) totals.get(k) + (Decimal) money.get(k));
            }
        }
        cards.sort(new ByActivity());
        return new Map<String, Object>{
            'customers' => cards,
            'totals' => totals,
            'truncated' => data.truncated,
            'paymentsReadable' => paymentsReadable()
        };
    }

    public static Map<String, Object> customer(Id accountId) {
        AmwajSalesSupport.requireReadable(Account.SObjectType);
        Dataset data = load(new Set<Id>{ accountId });
        List<UnitLine> lines = linesByAccount(data).get(accountId);
        Boolean anyDeal = data.dealsByAccount.containsKey(accountId);
        if (!data.accounts.containsKey(accountId) || (!anyDeal && (lines == null || lines.isEmpty()))) {
            throw AmwajSalesException.notFound('This customer was not found, or none of their deals are shared with you.');
        }
        Map<String, Object> out = summarize(data, accountId, lines, true);
        out.put('paymentsReadable', paymentsReadable());
        out.put('truncated', data.truncated);
        return out;
    }

    // ------------------------------------------------------------------ loading (fixed number of queries)

    private static Dataset load(Set<Id> accountIds) {
        Dataset data = new Dataset();
        if (accountIds.isEmpty()) {
            return data;
        }
        Integer maxRows = MAX_ROWS;
        for (SObject a : Database.query(
            'SELECT ' + AmwajSalesSupport.selectList(Account.SObjectType, ACCOUNT_ROW.values()) +
            ' FROM Account WHERE Id IN :accountIds WITH USER_MODE'
        )) {
            data.accounts.put(a.Id, a);
        }
        Set<Id> visibleAccounts = data.accounts.keySet();

        // Every deal on these customers that the user can see (not only their own).
        for (SObject d : Database.query(
            'SELECT ' + AmwajSalesSupport.selectList(Opportunity.SObjectType, DEAL_ROW.values()) +
            ' FROM Opportunity WHERE AccountId IN :visibleAccounts WITH USER_MODE ORDER BY CreatedDate DESC LIMIT :maxRows'
        )) {
            data.deals.put(d.Id, d);
            Id accountId = (Id) AmwajSalesSupport.val(d, 'AccountId');
            if (!data.dealsByAccount.containsKey(accountId)) {
                data.dealsByAccount.put(accountId, new List<SObject>());
            }
            data.dealsByAccount.get(accountId).add(d);
        }
        data.truncated = data.deals.size() >= MAX_ROWS;
        Set<Id> dealIds = data.deals.keySet();

        List<SObject> eois = new List<SObject>();
        if (Schema.SObjectType.EOI__c.isAccessible()) {
            List<String> clauses = new List<String>{ 'LinkedOpportunity__c IN :dealIds' };
            if (AmwajSalesSupport.canRead(EOI__c.SObjectType, 'PersonAccount__c')) {
                clauses.add('PersonAccount__c IN :visibleAccounts');
            }
            eois = Database.query(
                'SELECT ' + AmwajSalesSupport.selectList(EOI__c.SObjectType, EOI_ROW.values()) +
                ' FROM EOI__c WHERE ' + String.join(clauses, ' OR ') +
                ' WITH USER_MODE ORDER BY CreatedDate DESC LIMIT :maxRows'
            );
            data.truncated = data.truncated || eois.size() >= MAX_ROWS;
        }
        for (SObject e : eois) {
            UnitLine line = new UnitLine();
            line.key = e.Id;
            line.eoi = e;
            line.dealId = (Id) AmwajSalesSupport.val(e, 'LinkedOpportunity__c');
            line.accountId = accountFor(data, line.dealId, (Id) AmwajSalesSupport.val(e, 'PersonAccount__c'));
            data.lines.put(line.key, line);
        }
        Set<Id> eoiIds = new Map<Id, SObject>(eois).keySet();

        List<SObject> reservations = new List<SObject>();
        if (Schema.SObjectType.Reservation__c.isAccessible()) {
            List<String> clauses = new List<String>{ 'Opportunity__c IN :dealIds' };
            if (AmwajSalesSupport.canRead(Reservation__c.SObjectType, 'EOI__c')) {
                clauses.add('EOI__c IN :eoiIds');
            }
            if (AmwajSalesSupport.canRead(Reservation__c.SObjectType, 'PersonAccount__c')) {
                clauses.add('PersonAccount__c IN :visibleAccounts');
            }
            reservations = Database.query(
                'SELECT ' + AmwajSalesSupport.selectList(Reservation__c.SObjectType, RESERVATION_ROW.values()) +
                ' FROM Reservation__c WHERE ' + String.join(clauses, ' OR ') +
                ' WITH USER_MODE ORDER BY CreatedDate DESC LIMIT :maxRows'
            );
            data.truncated = data.truncated || reservations.size() >= MAX_ROWS;
        }
        Map<Id, String> lineByReservation = new Map<Id, String>();
        for (SObject r : reservations) {
            Id eoiId = (Id) AmwajSalesSupport.val(r, 'EOI__c');
            UnitLine line = eoiId == null ? null : data.lines.get(eoiId);
            if (line == null) {
                line = new UnitLine();
                line.key = r.Id;
                line.dealId = (Id) AmwajSalesSupport.val(r, 'Opportunity__c');
                line.accountId = accountFor(data, line.dealId, (Id) AmwajSalesSupport.val(r, 'PersonAccount__c'));
                data.lines.put(line.key, line);
            }
            line.reservations.add(r);
            lineByReservation.put(r.Id, line.key);
        }

        if (Schema.SObjectType.RefundRequest__c.isAccessible() && !data.lines.isEmpty()) {
            Set<Id> reservationIds = lineByReservation.keySet();
            List<String> clauses = new List<String>();
            if (AmwajSalesSupport.canRead(RefundRequest__c.SObjectType, 'EOI__c')) {
                clauses.add('EOI__c IN :eoiIds');
            }
            if (AmwajSalesSupport.canRead(RefundRequest__c.SObjectType, 'Reservation__c')) {
                clauses.add('Reservation__c IN :reservationIds');
            }
            if (!clauses.isEmpty()) {
                for (SObject rr : Database.query(
                    'SELECT ' + AmwajSalesSupport.selectList(RefundRequest__c.SObjectType, REFUND_ROW.values()) +
                    ' FROM RefundRequest__c WHERE ' + String.join(clauses, ' OR ') + ' WITH USER_MODE LIMIT :maxRows'
                )) {
                    Id eoiId = (Id) AmwajSalesSupport.val(rr, 'EOI__c');
                    String key = eoiId != null && data.lines.containsKey(eoiId)
                        ? (String) eoiId
                        : lineByReservation.get((Id) AmwajSalesSupport.val(rr, 'Reservation__c'));
                    if (key != null) {
                        data.lines.get(key).refunds.add(rr);
                    }
                }
            }
        }
        return data;
    }

    private static Id accountFor(Dataset data, Id dealId, Id recordAccountId) {
        SObject deal = dealId == null ? null : data.deals.get(dealId);
        Id fromDeal = deal == null ? null : (Id) AmwajSalesSupport.val(deal, 'AccountId');
        return fromDeal != null ? fromDeal : recordAccountId;
    }

    private static List<SObject> dealsOf(Dataset data, Id accountId) {
        List<SObject> deals = data.dealsByAccount.get(accountId);
        return deals == null ? new List<SObject>() : deals;
    }

    private static Map<Id, List<UnitLine>> linesByAccount(Dataset data) {
        Map<Id, List<UnitLine>> out = new Map<Id, List<UnitLine>>();
        for (UnitLine line : data.lines.values()) {
            if (line.accountId == null || !data.accounts.containsKey(line.accountId)) {
                continue;
            }
            if (!out.containsKey(line.accountId)) {
                out.put(line.accountId, new List<UnitLine>());
            }
            out.get(line.accountId).add(line);
        }
        return out;
    }

    // ------------------------------------------------------------------ aggregation

    private static Map<String, Object> summarize(Dataset data, Id accountId, List<UnitLine> lines, Boolean detailed) {
        lines = lines == null ? new List<UnitLine>() : lines;
        Boolean moneyReadable = paymentsReadable();
        Map<String, Object> out = AmwajSalesSupport.row(data.accounts.get(accountId), ACCOUNT_ROW);

        List<Map<String, Object>> deals = new List<Map<String, Object>>();
        Id me = AmwajSalesSupport.currentUserId();
        Integer myDeals = 0;
        Datetime lastActivity;
        Set<Id> dealsWithVisibleEoi = new Set<Id>();
        Set<Id> dealsWithVisibleReservation = new Set<Id>();
        for (UnitLine line : lines) {
            if (line.eoi != null && line.dealId != null) {
                dealsWithVisibleEoi.add(line.dealId);
            }
            for (SObject r : line.reservations) {
                Id rDeal = (Id) AmwajSalesSupport.val(r, 'Opportunity__c');
                dealsWithVisibleReservation.add(rDeal != null ? rDeal : line.dealId);
            }
        }
        Boolean hiddenRecords = false;
        for (SObject d : dealsOf(data, accountId)) {
            Map<String, Object> deal = AmwajSalesSupport.row(d, DEAL_ROW);
            deal.put('isMine', (Id) deal.get('ownerId') == me);
            myDeals += (Id) deal.get('ownerId') == me ? 1 : 0;
            deals.add(deal);
            hiddenRecords = hiddenRecords ||
                (AmwajSalesSupport.bool(d, 'EOI_Created__c') && !dealsWithVisibleEoi.contains(d.Id)) ||
                (AmwajSalesSupport.bool(d, 'Reservation_Created__c') && !dealsWithVisibleReservation.contains(d.Id));
        }

        Integer sold = 0;
        Integer reserved = 0;
        Integer eoiHold = 0;
        Integer closed = 0;
        Decimal confirmedPaid = 0;
        Decimal confirmedBookingFees = 0;
        Decimal confirmedDeposits = 0;
        Decimal refunds = 0;
        Decimal pending = 0;
        Decimal excluded = 0;
        Decimal price = 0;
        Decimal towardPrice = 0;
        Boolean priceKnown = true;
        Set<String> flags = new Set<String>();
        List<Map<String, Object>> units = new List<Map<String, Object>>();
        for (UnitLine line : lines) {
            String status = AmwajPaymentLedger.saleStatus(line.eoi, line.reservations);
            AmwajPaymentLedger.UnitMoney m = AmwajPaymentLedger.reconcile(line.eoi, line.reservations, line.refunds);
            if (status == AmwajPaymentLedger.SOLD) {
                sold++;
            } else if (status == AmwajPaymentLedger.RESERVED) {
                reserved++;
            } else if (status == AmwajPaymentLedger.EOI_HOLD) {
                eoiHold++;
            } else {
                closed++;
            }
            confirmedPaid += m.netConfirmed;
            confirmedBookingFees += m.confirmedBookingFee;
            confirmedDeposits += m.confirmedDeposits;
            refunds += m.refunds;
            pending += m.pendingBookingFee + m.pendingDeposits;
            excluded += m.excludedDeposits;
            flags.addAll(m.flags);
            if (status == AmwajPaymentLedger.SOLD || status == AmwajPaymentLedger.RESERVED) {
                priceKnown = priceKnown && m.price != null;
                price += m.price == null ? 0 : m.price;
                towardPrice += m.confirmedTowardPrice;
            }
            units.add(unit(data, line, status, m, detailed));
            Datetime created = (Datetime) AmwajSalesSupport.val(line.eoi != null ? line.eoi : line.reservations[0], 'CreatedDate');
            lastActivity = lastActivity == null || (created != null && created > lastActivity) ? created : lastActivity;
        }
        units.sort(new ByStatus());

        out.put('counts', new Map<String, Object>{
            'sold' => sold, 'reserved' => reserved, 'eoiHold' => eoiHold, 'closed' => closed, 'deals' => deals.size(), 'myDeals' => myDeals
        });
        out.put('units', units);
        out.put('payments', new Map<String, Object>{
            // Null = not available to this user (field access), shown as such rather than as zero.
            'confirmedPaid' => moneyReadable ? confirmedPaid : null,
            'confirmedBookingFees' => moneyReadable ? confirmedBookingFees : null,
            'confirmedDeposits' => moneyReadable ? confirmedDeposits : null,
            'refunds' => moneyReadable ? refunds : null,
            'pendingConfirmation' => moneyReadable ? pending : null,
            'excludedDeposits' => moneyReadable ? excluded : null,
            'propertyPrice' => sold + reserved == 0 || !priceKnown ? null : price,
            'confirmedTowardPrice' => moneyReadable && sold + reserved > 0 ? towardPrice : null,
            // The org records no instalment schedule, receipts or due dates (see AmwajPaymentLedger).
            'remainingPayable' => null,
            'overdue' => null,
            'nextPayment' => null,
            'installmentsRecorded' => false
        });
        out.put('flags', new List<String>(flags));
        out.put('hiddenRecords', hiddenRecords);
        out.put('lastActivity', lastActivity);
        if (detailed) {
            out.put('deals', deals);
        }
        return out;
    }

    private static Map<String, Object> unit(Dataset data, UnitLine line, String status, AmwajPaymentLedger.UnitMoney m, Boolean detailed) {
        SObject primary = line.eoi != null ? line.eoi : line.reservations[0];
        SObject current = currentReservation(line.reservations);
        Map<String, Object> u = new Map<String, Object>{
            'key' => line.key,
            'unitId' => AmwajSalesSupport.val(primary, 'Inventory__c'),
            'unitName' => AmwajSalesSupport.val(primary, 'Inventory__r.Name'),
            'projectName' => line.eoi != null
                ? AmwajSalesSupport.val(line.eoi, 'Project__r.Name')
                : AmwajSalesSupport.val(primary, 'Inventory__r.Project__r.Name'),
            'saleStatus' => status,
            'eoiStatus' => line.eoi == null ? null : AmwajSalesSupport.val(line.eoi, 'Status__c'),
            'reservationStatus' => current == null ? null : AmwajSalesSupport.val(current, 'Status__c'),
            'netConfirmed' => m.netConfirmed,
            'price' => m.price
        };
        if (!detailed) {
            return u;
        }
        SObject deal = line.dealId == null ? null : data.deals.get(line.dealId);
        Map<String, Object> dealRow = deal == null ? null : AmwajSalesSupport.row(deal, DEAL_ROW);
        if (dealRow != null) {
            dealRow.put('isMine', (Id) dealRow.get('ownerId') == AmwajSalesSupport.currentUserId());
        }
        List<Map<String, Object>> reservations = new List<Map<String, Object>>();
        for (SObject r : line.reservations) {
            reservations.add(AmwajSalesSupport.row(r, RESERVATION_ROW));
        }
        List<Map<String, Object>> refunds = new List<Map<String, Object>>();
        for (SObject rr : line.refunds) {
            refunds.add(AmwajSalesSupport.row(rr, REFUND_ROW));
        }
        u.put('deal', dealRow);
        u.put('dealId', line.dealId);
        u.put('eoi', line.eoi == null ? null : AmwajSalesSupport.row(line.eoi, EOI_ROW));
        u.put('reservations', reservations);
        u.put('refunds', refunds);
        u.put('saleDate', current == null || status != AmwajPaymentLedger.SOLD ? null : AmwajSalesSupport.val(current, 'ActivationDate__c'));
        u.put(
            'paymentPlanName',
            current != null && AmwajSalesSupport.val(current, 'PaymentPlan__r.Name') != null
                ? AmwajSalesSupport.val(current, 'PaymentPlan__r.Name')
                : (line.eoi == null ? null : AmwajSalesSupport.val(line.eoi, 'Preferred_Payment_Plan__r.Name'))
        );
        u.put('money', paymentsReadable() ? m : null);
        return u;
    }

    /** The live or sold reservation, else the newest one (rows arrive newest first). */
    private static SObject currentReservation(List<SObject> reservations) {
        for (SObject r : reservations) {
            if (AmwajPaymentLedger.isLive(r)) {
                return r;
            }
        }
        return reservations.isEmpty() ? null : reservations[0];
    }

    private static Boolean matches(Dataset data, Id accountId, List<UnitLine> lines, String term, String projectId) {
        if (term != null) {
            Boolean hit = false;
            SObject a = data.accounts.get(accountId);
            for (String path : new List<String>{ 'Name', 'PersonMobilePhone', 'Phone', 'PersonEmail' }) {
                String v = AmwajSalesSupport.str(a, path);
                hit = hit || (v != null && v.toLowerCase().contains(term));
            }
            if (!hit) {
                return false;
            }
        }
        if (String.isNotBlank(projectId)) {
            Id project = Id.valueOf(projectId);
            for (SObject d : dealsOf(data, accountId)) {
                if ((Id) AmwajSalesSupport.val(d, 'Project__c') == project) {
                    return true;
                }
            }
            for (UnitLine line : lines == null ? new List<UnitLine>() : lines) {
                SObject primary = line.eoi != null ? line.eoi : line.reservations[0];
                Object p = line.eoi != null
                    ? AmwajSalesSupport.val(line.eoi, 'Project__c')
                    : AmwajSalesSupport.val(primary, 'Inventory__r.Project__c');
                if ((Id) p == project) {
                    return true;
                }
            }
            return false;
        }
        return true;
    }

    /** True when the user can read the fields that say what was paid and whether finance confirmed it. */
    private static Boolean paymentsReadable() {
        for (String f : EOI_MONEY_FIELDS) {
            if (!AmwajSalesSupport.canRead(EOI__c.SObjectType, f)) {
                return false;
            }
        }
        for (String f : RESERVATION_MONEY_FIELDS) {
            if (!AmwajSalesSupport.canRead(Reservation__c.SObjectType, f)) {
                return false;
            }
        }
        return true;
    }

    /** Sold first, then reserved, held by EOI, and released or cancelled. */
    private class ByStatus implements Comparator<Map<String, Object>> {
        private final List<String> order = new List<String>{
            AmwajPaymentLedger.SOLD, AmwajPaymentLedger.RESERVED, AmwajPaymentLedger.EOI_HOLD, AmwajPaymentLedger.CLOSED
        };
        public Integer compare(Map<String, Object> a, Map<String, Object> b) {
            return order.indexOf((String) a.get('saleStatus')) - order.indexOf((String) b.get('saleStatus'));
        }
    }

    /** Customers with the most recent EOI or reservation first; those with none last, by name. */
    private class ByActivity implements Comparator<Map<String, Object>> {
        public Integer compare(Map<String, Object> a, Map<String, Object> b) {
            Datetime x = (Datetime) a.get('lastActivity');
            Datetime y = (Datetime) b.get('lastActivity');
            if (x != y) {
                if (x == null) {
                    return 1;
                }
                if (y == null) {
                    return -1;
                }
                return x > y ? -1 : 1;
            }
            String n1 = (String) a.get('name');
            String n2 = (String) b.get('name');
            return (n1 == null ? '' : n1).compareTo(n2 == null ? '' : n2);
        }
    }
}
