# Amwaj Sales Workspace (SalesUI)

React 19 / Vite UI Bundle (`force-app/main/default/uiBundles/SalesUI`) backed by the Apex REST API
`/services/apexrest/amwaj/sales/v1` (class `AmwajSalesApi`). Org: **AmwajReact**, `00DRR00000WVnGo2AL`, *Amwaj Iraq*,
**sandbox**, single currency **USD**, time zone Asia/Baghdad. Nothing has been deployed to production.

**App link (sandbox):** https://amwaj--reactapp--c.sandbox.my.salesforce.app/app/c__SalesUI

## 1. Sales-user error: "You do not have access to the Apex class named: AmwajSalesApi"

- **Affected user / session:** Sarah Khazaal (`Amwaj User` profile, role `Sales_Exec_Iraq_Gate`, Salesforce licence), opened by the
  admin with *Log in as* on 5 Oct 2026 10:03 UTC (Setup Audit Trail). Assignments: `Amwaj_SalesExec_PS`, `SalesUI_Access`,
  profile permission set. No permission-set groups, muting or licence restrictions involved. `ApiEnabled` comes from the profile
  and `SalesUI_Access`.
- **Root cause (application defect):** in the org, only the System Administrator profile had class access to `AmwajSalesApi`.
  The class-access entry for `SalesUI_Access` was missing from the source that was actually deployed (the edit was lost
  before commit), so the deployment reported the permission set as *Unchanged*. The Apex tests didn't catch it, because REST
  methods called directly in tests skip the class-access check.
- **Fix:** `SalesUI_Access` grants `AmwajSalesApi` (only that class), deploy `0AfRR00000gcoOb0AI`, verified through
  `SetupEntityAccess`. A test now asserts the grant (`AmwajSalesApiTest.salesUiAccessGrantsTheApiClass`).
- **Verified:** the deployed app loads for Sarah (screenshot `after-overview-sales-user.jpg`).

## 2. Permission matrix (effective access for a sales executive)

Effective = union of the `Amwaj User` profile, `Amwaj_SalesExec_PS` and `SalesUI_Access`, traced with ObjectPermissions /
FieldPermissions. Reads in the app are `WITH USER_MODE` with field lists filtered to readable fields.

| Feature | Needed | Existing access | Change made |
| --- | --- | --- | --- |
| Open the app / API | App visibility, `ApiEnabled`, class `AmwajSalesApi` | App + API via `SalesUI_Access`; class **missing** | Class access added to `SalesUI_Access` |
| Assigned leads, status/notes | Lead R/E, Status/Description edit; sharing (Lead OWD Private) | Lead CRE; Description E; **Rating not readable** | None (Rating hidden for reps) |
| Customer deals | Opportunity R/E, Account R/E (Opportunity OWD Private) | CRE on both | None |
| Projects, units, prices, plans | Read on Project, Building, Inventory, PriceList(Item), PaymentPlan(Installment) | Read via `Amwaj_SalesExec_PS` | None |
| Convert lead (in the app) | `ConvertLeads`; Lead edit on the record; Account, Contact, Opportunity create | `ConvertLeads` on profile and `Amwaj_SalesExec_PS`; Lead E (owner); Account/Contact/Opportunity CRE | None. Conversion runs in **user mode** (see §9) |
| Create EOI / reservation | Create on EOI / Reservation; edit on the deal | EOI CR, Reservation CR, Opportunity E | None. Writes mirror the org's system-mode flows after a user-mode access check |
| Calls and follow-ups (Task) | Edit Tasks + read/edit on `Task.WhoId`, `WhatId`, `ActivityDate`, `Description` | Edit Tasks only; **no Task field access** | Read/edit on those 4 fields in `SalesUI_Access`. Salesforce applies the shared fields to Event too (`Event.WhoId/WhatId/Description`) |
| Signed EOI upload | Edit on `EOI__c` + `EOI_Document_Attached__c` | `EOI__c` **no Edit**; field E (PS) | **None (decision needed)**: object Edit would also let reps change `Discount__c`, `Approval_Status__c`, `Payment_Method__c` and `Preferred_Payment_Plan__c` (editable via the profile), bypassing discount approval |
| Finance confirmation | `EOI__c.PaymentVerifiedByFinance__c`, `Reservation__c.DepositVerified__c` | EOI field: read-only for reps. Deposit field: E via `Amwaj_SalesExec_PS`, but **dormant** (no Reservation Edit) | None. App never exposes these actions |
| Commission view | Read own deals; server reads finance fields | Via the API (system-mode read of amounts on the user's own deals only) | None |

Grants to review (not changed):
- `Opportunity.SalesCommissionAmount__c` is **effectively editable** by reps (and by Team Leader, Sales Director, Deputy Director
  and System Admin Persona). No flow, Apex or app logic uses it. Removing it from `Amwaj_SalesExec_PS` affects no process I could
  find, but it is a shared org permission set, so this needs your approval.
- `Reservation__c.DepositVerified__c` edit in `Amwaj_SalesExec_PS` is dormant today. It would become effective if reps ever got
  Reservation Edit. Deposit verification otherwise sits with Administration (9 users) and Follow-Up (7). Recommend removing it from
  the Sales Executive PS.

## 3. Business logic (follows the org; read from configuration)

| Rule | Source |
| --- | --- |
| EOI hold length | `PackageSettings__c.EOI_Period_Days__c` (**3**) via the EOI before-save flow; shown from settings |
| Reservation hold length | `PackageSettings__c.DefaultHoldDays__c` (**14**) via the Reservation before-save flow |
| Booking (reservation) fee | 1.5% of list price, hard-coded **in the org's EOI and reservation screen flows**; the API mirrors it |
| Price and plan eligibility | `PaymentPlanViewerController` (existing; blank price-list start date treated as effective, approved earlier) |
| Discounts | Whole number 0–20% (EOI flow screen rule); approval routing by the org's approval flows |
| Signature evidence | `EOI_Document_Attached__c` (signed document on file); no e-signature in use |
| Finance confirmation, stages, unit status | Existing record-triggered flows |
| Currency / dates | `UserInfo` currency (USD); dates from Salesforce; timestamps shown in the user's Salesforce time zone |

The 14-day *offer* hold in the earlier demo was a demo assumption, not a requirement, and is not implemented.

**Commission: a requested enhancement, not existing org logic.** The rate lives in `Amwaj_Commission_Policy__mdt.Default`
(1%), created during this project. The UI labels it "Proposed … pending confirmation". **Unconfirmed assumptions:** attribution
to the current deal owner; cash basis (processed refunds deduct, so an expired or cancelled EOI keeps commission until a refund
is processed); no splits; payout handled elsewhere. Tax is **not recorded** in the org and is shown as unavailable, not zero.
Commission paid is **not tracked**. Per-sold-unit breakdown and the shared payment reconciliation: §10.

## 4. Filters

| Screen | Filter | Field mapping | Notes |
| --- | --- | --- | --- |
| Units | Project (step 1) | `Inventory__c.Project__c` | Chips with available counts (`Project__c.AvailableUnits__c`) |
| Units | Unit type (step 2) | `Inventory__c.Unit_Type__c` | Independent picklist, no record types. Options per project come from the inventory (aggregate), with available counts. An incompatible type is cleared on project change, with a message |
| Units | Availability, bedrooms (min), zone, min/max price, search | `Status__c`, `Bedrooms__c`, `Zone__c` (per project), `Unit_Price__c`, `Name`/`UnitCode__c`/`Building__r.Name` | All server-side; count and pagination cover every match; chips + Clear filters |
| Units | Customer context | `?dealId=` / `?leadId=` | Starts from the deal's `Project__c` or the lead's `Project_Interest__c`, and the unit type of `Interested_Unit__c` (the only unit-type preference the org records). Applied once; later browsing never changes the customer record. Carried to unit detail and into the EOI form; filters kept on "Back to units" |
| My leads | Project of interest | `Lead.Project_Interest__c` or `nd_Project_of_Interest__c` | No unit-type preference field exists on leads (data gap, not invented) |
| Customers | Project | `Opportunity.Project__c` of any of the customer's deals, or the project of any of their EOIs/reservations | Server-side; totals cover every matching customer (§10) |
| Customers | Search | Account `Name`, `PersonMobilePhone`, `Phone`, `PersonEmail` | Server-side |
| My commission | Project, customer, unit/EOI/reservation text | Lines from the commission service | Client-side over the complete line set; totals follow the filter |

Projects without an active payment plan (Iraq Gate) show a notice on Units, and unit detail explains why an EOI can't start. No
plan is created and eligibility is not bypassed.

## 5. Validation

| Check | Result |
| --- | --- |
| Apex tests (`AmwajOfferServiceTest`, `AmwajCommissionServiceTest`, `AmwajSalesApiTest`, `PaymentPlanViewerControllerTest`) | **39/39 pass** in the sandbox (deploy `0AfRR00000gceCP0AY`), run as users with exactly the reps' profile + permission sets |
| Frontend | `tsc` + `vite build` pass; ESLint 0 errors (6 advisory warnings); Vitest **7/7** (formatting; project → unit-type logic) |
| **Deployed app as Sarah Khazaal** (Log in as, sandbox) | Overview, My leads (own test lead only), Customers, deal detail, follow-up created as her (Task owned by Sarah, due 7 Oct), Units with customer context (project and type preselected), project change clearing type, Villa + 4 bedrooms = 92 matches over 4 server pages, unit detail with customer CTA, **EOI-00000100 created by her** (A10 held until 8 Oct = 3-day setting, fee $3,519), EOI page with upload/reserve correctly unavailable, another user's EOI and lead → "not shared", commission page |
| Phone layout | Checked at 390 px in a frame on the **local** build (CLI admin data); found and fixed horizontal overflow on New EOI. The deployed app at phone width as a sales user was **not** captured (Chrome window couldn't be resized) |
| Not verified | Playwright e2e (browsers not installed); refunds live; media display (no files in org); signed-EOI upload by an authorised operations user via the browser |

Test data (sandbox, labelled "SalesUI TEST"): lead `00QRR00000RdTtp2AF` and deal `006RR00000YOkMJYA1` owned by Sarah; EOI-00000100
was set to Expired after the check (A10 back to Available). Her follow-up task is still open. Earlier: EOI-00000099 / RES-00000028
(closed). Rep emails in this sandbox end in `.invalid`; no customer notifications are sent by these flows.

### Screenshots (`docs/screenshots/`)
- Before: `before-units-admin-session.jpg` (previous round, admin-only via local proxy; your screenshot showed the access error).
- After (deployed app, Sarah Khazaal): `after-overview-sales-user.jpg`, `after-leads-project-filter-sales-user.jpg`,
  `after-units-customer-context-sales-user.jpg`, `after-project-change-clears-type-sales-user.jpg`,
  `after-unit-detail-sales-user.jpg`, `after-eoi-restricted-actions-sales-user.jpg`.
- Phone: `after-phone-390px-local-build.jpg` (local build, admin data).

## 6. Defects

**Existing org defects (not changed; proposed fixes):**
1. **Holds don't expire.** `EOI_Release_the_Held_Unit_Scheduled` only sets `Due__c` and sends a warning, so units stay Held (22 in the
   sandbox past expiry). Reservations have no expiry automation, and `HoldExpiryFuture` checks a "Held" status that doesn't exist.
   *Fix:* have the scheduled flow set `Status__c = Expired` (the existing after-save flow then releases the unit); add an equivalent
   for reservations; fix or remove the dead rule. Decide whether reps may extend holds (they can edit `ExpiryDate__c` today).
2. **Signed-document link lost.** `EOI_Attachment_Screen` links the file to a `CustomerDocument__c` that a scheduled path deletes 2
   minutes later, so the EOI keeps the checkbox but no file. *Fix:* also link the file to the EOI (ContentDocumentLink) before the
   cleanup, or stop deleting.
3. **Who files the signed EOI:** reps have no EOI Edit (see matrix). Decide the responsible role.
4. Data: Iraq Gate has no active payment plan; most deals are owned by the admin. Plan *garden 5 payments* totals 100.01% and
   *Karblaa Gate* 95.5% (§9.3). 51 of 52 leads carry Company "Individual" (handled at conversion, §9.1).

**Application defects found and fixed this round:** missing class grant (§1); Task fields missing for follow-ups; phone overflow on
New EOI; one failing overview panel could blank the page (panels now load independently); "not shared" records offered a useless
retry; duplicate screen-reader announcement.

## 7. Deploy

```bash
cd force-app/main/default/uiBundles/SalesUI && npm install && npm run build && cd -
sf project deploy start -o <alias> \
  --source-dir force-app/main/default/classes \
  --source-dir force-app/main/default/objects/Amwaj_Commission_Policy__mdt \
  --source-dir force-app/main/default/customMetadata \
  --source-dir force-app/main/default/uiBundles/SalesUI \
  --test-level RunSpecifiedTests --tests AmwajLeadConversionServiceTest --tests AmwajOfferServiceTest \
  --tests AmwajCommissionServiceTest --tests AmwajSalesApiTest --tests PaymentPlanViewerControllerTest \
  --tests AmwajPaymentLedgerTest --tests AmwajCustomerPortfolioServiceTest --tests AmwajEoiDocumentServiceTest
# Deploy the permission set separately, after the class exists (deploying it with a brand-new class is what lost the grant):
sf project deploy start -o <alias> --source-dir force-app/main/default/permissionsets/SalesUI_Access.permissionset-meta.xml
```
Then confirm: `SELECT Parent.Name FROM SetupEntityAccess WHERE SetupEntityId IN (SELECT Id FROM ApexClass WHERE Name = 'AmwajSalesApi')`.

## 8. Manager demo (about 5 minutes, as a sales user)

1. **Overview** – personal counts, unit holds, EOIs needing action, and the commission *estimate* (proposed rule).
2. **Customers → SalesUI TEST Customer 2 → Find units in The Gardenes** – the customer banner, with project and type taken from the
   recorded interest.
3. **Filters** – switch to New Kadhimyah Gate: Apartment is cleared because it doesn't exist there. Choose Villa and 4+ bedrooms;
   the count and chips update and pages cover every match. Open a unit; "Back to units" keeps the filters.
4. **Continue to booking** – choose the plan; for a lead, confirm details and convert it here (§9), then the EOI form opens prefilled.
   **Create the EOI** – required details are checked as the org's flow does. Salesforce returns the fee and the
   3-day hold from settings.
5. **EOI page** – two-stage hold explained (EOI 3 days, reservation 14 days); finance and filing steps aren't available to reps.
6. **My commission** – proposed rule labelled as such; tax "not recorded"; payouts "not tracked".
7. Close with the defects and decisions in §2 and §6.

## 9. Lead to booking inside the app (Oct 2026)

The rep now goes **lead → unit and plan → convert lead → EOI → booked** without leaving the app. The previous instruction
("Convert the lead in Salesforce … then start the EOI from Customers") is replaced by **Continue to booking**.

### 9.1 The org's conversion setup (inspected, reused)

| Item | What the org has | How the app uses it |
| --- | --- | --- |
| Mechanism | Standard lead conversion; no custom convert flow or Apex exists. `Lead.Buyer__c` / `Opportunity.OriginatingLead__c` describe a "guided convert" (RE-GAP-002 / RE-DEC-14) that was never built | `Database.convertLead` in **user mode** (`AmwajLeadConversionService`). No records are imitated and Lead Status is not set by hand |
| Converted status | `Qualified` (only `IsConverted` status) | Read from `LeadStatus` |
| Field mappings | Lead Convert Settings: Lead → Account (Channel, Organization), → Contact/person account (national ID and date, residence ID and date, nationality, profession, projects), → Opportunity (Project_Interest → Project, Interested Unit, Broker, Channel, Organization). Opportunity creation optional | Applied by Salesforce. The new deal also gets `OriginatingLead__c` |
| Person accounts | All 52 customers are person accounts. Native conversion creates a person account **only when Company is blank**; 51 of 52 leads carry the placeholder Company "Individual", which would create a business account named "Individual" (verified with a rolled-back probe) | The placeholder is cleared on the lead in the same transaction, just before conversion. A lead with a real company name is **not** converted here (EOIs need a person account) |
| Duplicate rules | Standard duplicate rules on Lead/Account/Contact/Person Account are all **inactive** | Not used |
| Org duplicate check | `Get_Duplicate_Leads_SubFlow` (mobile, phone, national ID), used by Lead Quick Create | Called to list existing-customer matches |
| Hard uniqueness | `Account.Mobile_Normalized__c` (unique, set by the Account flow: 0770… → +964770…) and `Contact.NationalID__c` (unique) | Matching also uses the canonical mobile; "Create new customer" is disabled when a match has the same mobile or national ID; a database duplicate error is shown as a clear message |
| Validation rules | `Convert_Must_Use_Linked_Buyer` (a lead with `Buyer__c` must convert into it); Lead/Account mobile format; Account national ID = 12 digits; Reception/Call Centre roles can't change Lead status | Enforced by Salesforce (user mode) and pre-checked in the form. Call Centre/Reception users are refused by the org's rule: a genuine role restriction, not bypassed |
| Permissions | Reps: `ConvertLeads`, Account/Contact/Opportunity create, Lead edit on own leads (Lead OWD Private, Account OWD Read/Write) | No permission was added |

**One system-mode write:** Salesforce refuses a user-mode lookup to a *converted* lead ("cannot reference converted lead"), even
though reps may edit `Opportunity.OriginatingLead__c`. That single attribution field is written in system mode on the deal just
created. Converted leads cannot be edited, so `Buyer__c` is recorded only when converting into an existing customer.

### 9.2 Behaviour

- **Unit page:** with a lead or deal context, the rep chooses the payment plan (pre-selected when only one applies) and clicks
  **Continue to booking**. Lead, project, unit, plan and all browse filters stay in the URL; "Back" returns to the same list.
- **Convert step** (`/leads/:id/convert`): confirm name, mobile, email, national ID; see existing-customer matches (reason, owner,
  open deals) and choose *new customer + new deal*, *existing customer + new deal*, or *existing customer + their open deal*
  (open, no EOI, editable). Only server-confirmed matches are accepted.
- **Retries and already-converted leads:** the lead row is locked (`FOR UPDATE`); a converted lead is answered with its customer
  and deal ("Nothing was converted again"), never reconverted.
- **EOI step:** opens with customer, deal, unit and plan filled in; shows list price, booking fee (1.5% of list price, from the
  org's EOI flow), discount rules and the expected hold end date. The request carries the reviewed list price; if Salesforce's
  price has changed, nothing is created (409).
- **Partial completion:** if the EOI fails after conversion, the customer and deal stay; the message says so and the rep retries on
  the same deal. Returning via the lead resolves to that deal.
- **Confirmation:** EOI number, customer and deal, unit and plan, payment method, booking fee, net price, discount, actual hold
  expiry, status and approval, next permitted action, and **Open in Salesforce**.
- **EOI parity fixes:** like the org's EOI screen flow, the deal's `Project__c` is backfilled to the booked unit's project. `EOI.Lead__c`
  is set from the deal's `OriginatingLead__c` (the EOI create flow otherwise looks it up via `Buyer__c`, which new conversions
  cannot set).
- **EOI remains the right record** for the initial offer/hold: EOI holds the unit (`EOI_Period_Days__c` = 3), Reservation still requires
  a Paid EOI. No Offer object was introduced and no prerequisite was bypassed.

### 9.3 List price $163,200 vs plan total $163,216 (A103, The Gardenes)

**Data defect (rounding in the plan), not intentional and not an app calculation error.** Plan *garden 5 payments* stores
25% + 25% + 16.67% + 16.67% + 16.67% = **100.01%** (`PaymentPlanInstallment__c.Percentage__c` holds 4 decimals of a fraction, so
1/6 can't be stored exactly). Each instalment is list price × percentage (also how the org's `Calculate_the_Payment_Plan_Subflow`
works): 3 × $27,205.44 makes the total **$163,216.32**, $16.32 above the list price. The property price (EOI net price = unit
price less discount, and the subflow's total) stays **$163,200**. The app's "percentages don't add up" warning has a 0.5% tolerance,
so it stayed silent. Neither amount is overridden. The plan card now explains the difference. **Fix (sales admin):** set one
16.67% row to 16.66%, or decide that the final instalment absorbs rounding. All other active plans total exactly 100%, except
*Karblaa Gate* (95.5%), which the existing warning already flags.

### 9.4 Validation (AmwajReact sandbox)

| Check | Result |
| --- | --- |
| Apex | **50/50** pass (deploy `0AfRR00000ghnOf0AI`), incl. 11 new conversion tests run as users with the reps' profile + permission sets: person account (not "Individual"), mappings, retry/replay, existing-customer + existing deal, unmatched customer refused, linked buyer rule, company lead blocked, invalid mobile/ID, other rep's lead (404), canonical mobile duplicate, booking after failed EOI attempts (sold unit, changed price, duplicate mobile), project backfill, lead attribution |
| Frontend | `tsc` + `vite build` pass; ESLint 0 errors (2 earlier warnings remain); Vitest **13/13** (incl. journey links, plan-total check). UI deploy `0AfRR00000ghlZs0AI` |
| **As Sarah Khazaal** (Log in as) | *SalesUI TEST Lead* → The Gardenes / Apartment / A103 → plan pre-selected, price note shown → Continue → invalid mobile blocked in the form → converted (person account + deal *SalesUI TEST Lead-The Gardenes*, both owned by Sarah, lead *Qualified*, Company cleared) → EOI form prefilled → EOI refused for another customer's national ID, with the deal kept → corrected → **EOI-00000101** (Submitted, A103 **Held** until 11 Oct 2026, fee $2,448, net $163,200, `Lead__c` set, deal stage EOI) → 1 account, 1 deal. Reopening the convert step: "already converted", nothing reconverted |
| Existing customer | *SalesUI TEST Lead 2* (mobile +9647700000003) matched *SalesUI TEST Customer 2* (07700000003) via the normalised mobile; "new customer" disabled; converted into that customer with a new deal (`Buyer__c` set); reopening offered "Continue to the EOI" |

Test data left in the sandbox: EOI-00000101 holds A103 until 11 Oct 2026 (set it to Expired to release it); lead *SalesUI TEST
Lead 2* converted into *SalesUI TEST Customer 2* with deal *SalesUI TEST Customer 2-The Gardenes* (no EOI).

Screenshots: `booking-1-unit-continue-sales-user.jpg`, `booking-1b-plan-total-note-sales-user.jpg`,
`booking-2-convert-review-sales-user.jpg`, `booking-3-eoi-after-conversion-sales-user.jpg`,
`booking-3b-eoi-failure-kept-deal-sales-user.jpg`, `booking-4-eoi-created-sales-user.jpg`,
`booking-match-existing-customer-sales-user.jpg`.

**Not covered:** a real Call Centre user hitting the status rule (covered by the org's VR, not exercised); concurrent double-submit
from two browsers (protected by the row lock and covered by the replay test, not raced live); phone width for the new pages.


## 10. Customer cards, payment reconciliation and commission per sold unit (Oct 2026)

### 10.1 What the old cards were, and what they are now
The Customers page showed **one card per deal** (Opportunity), so a buyer with three deals appeared three times and no card showed
money. It now shows **one card per customer, grouped by Account (person account) Id**. The customers are those on deals the user owns;
each card combines every deal, EOI, reservation and refund on that customer **that the user can see** (user mode). Card: name and
phone → units sold / reserved / held by EOI (separately; a held or reserved unit is never called owned) with up to 3 units and
**View all N units** → payment summary. **View customer** opens `/customers/account/:accountId`, with one section per unit
(deal, EOI, reservation, sale status, payments). The deal page (`/customers/:dealId`) stays and links to the overview.

### 10.2 What the org records about money (inspected; nothing created)
| Concept | Record | Confirmed when | Notes |
| --- | --- | --- | --- |
| Booking fee | `EOI__c.Reservation_Fees__c` | `PaymentVerifiedByFinance__c` (flow stamps `PaymentVerifiedDate__c`, EOI → Paid) | The org's reservation screen labels it "EOI Percent (1.5%, **additional**)": charged on top of the price, never deducted from it |
| Deposit | `Reservation__c.DepositAmount__c` (plan down payment, or the amount entered for cash) | `DepositVerified__c` (flow: → PendingWithContracts, unit Reserved) | Screen help text: "will be deducted from the total Unit Price" |
| Price obligation | `Reservation__c.NetPrice__c` = `ListPrice__c × (1 − Discount__c)` | — | Only for live or sold reservations |
| Sale | `Reservation__c.Status__c = Active` (contract document filed) | Flow sets `ActivationDate__c`, unit Sold, deal Closed Won | Sale date = `ActivationDate__c` |
| Refund | `RefundRequest__c` Status Processed (`ApprovedAmount__c`) | Flow on Approved + document: Processed; `EOI__c` → Refunded with `RefundedAmount__c` | Refunds only target EOIs (a validation rule blocks them once a reservation is in contracts or active) |
| Instalment schedule, receipts, allocations, due dates, tax | **None exist** | — | `PaymentPlanInstallment__c` rows are plan templates, not customer obligations; Asset, Contract and Order hold no payments (0 records) |

### 10.3 Reconciliation rules (`AmwajPaymentLedger`, used by the cards *and* by commission)
- **Confirmed paid** = confirmed booking fee + confirmed deposits − processed refunds (never below zero). Requested but unconfirmed amounts
  are shown separately as **Awaiting finance**, and only while the EOI or reservation is live.
- **Confirmed toward the price** = the confirmed deposit on the live or sold reservation only (the fee is additional).
- **Refunds:** processed refund requests; if none is visible, the amount the org's flow stamps on a Refunded EOI. Never both (same money).
  Reps can't see refund requests raised by finance (Private, no sharing rules), so the EOI stamp is what makes refunds visible to them.
- **No double counting:** a confirmed deposit on a cancelled reservation is not counted when a later reservation on the same EOI has its own
  confirmed deposit (flagged for finance). An expired EOI with a confirmed fee and no processed refund stays counted (flagged).
- **Not recorded** (shown as such, never as zero): remaining payable, instalment counts (paid, partial, unpaid, overdue, upcoming), next
  payment, overdue. No reliable due dates exist, so nothing is labelled overdue. A field the user can't read shows *Not available*.
- **Rule to confirm:** a remaining balance could be shown as "net price − confirmed deposit" only if Amwaj confirms that no instalment is ever
  collected outside Salesforce. Collections and refunds go through an ERP (`RefundRequest__c.ERPReference__c`), so it is not shown.

### 10.4 My commission per sold unit
Built on the existing `AmwajCommissionService` and policy (`Amwaj_Commission_Policy__mdt.Default`, 1%, still **proposed, unconfirmed**;
every figure is labelled an estimate). Per sold unit: unit and project, customer, deal, EOI and reservation, sale date (`ActivationDate__c`),
sale value (`NetPrice__c`), eligible confirmed collections, rate, estimated commission. Totals and project, customer and text filters above.
Confirmed money on units **not** sold (reserved, held, released) still earns under the proposed cash-basis rule. It is shown in its own
section and total, never mixed in. **No forecast** on the remaining balance (instalment receipts aren't recorded). **No payout status**
(not tracked). Attribution: deal owner (unchanged assumption). Signature eligibility and refund treatment are unchanged.

**Security:** the commission's existing finance read (system mode, limited to deals the user owns) keeps its scope; it now also returns the
reservation **status** (to classify a unit as sold) and record ids. Sale value, sale date and reservation number are read in **user mode**; a
reservation the rep can't see shows "Not shared with you". The customer portfolio reads in user mode only.

### 10.5 API (extends the existing read API)
`GET customers?search=&projectId=` → cards + totals over the complete matching set; `GET customers/{accountId}` → unit detail.
A fixed set of queries whatever the number of customers (owned-deal aggregate, accounts, deals, EOIs, reservations, refunds).
The commission response adds `saleStatus`, reservation, sale date and value, `soldUnits`, `soldCommission`, `notSoldCommission`, `rateStatus`.
New classes: `AmwajPaymentLedger`, `AmwajCustomerPortfolioService` (+ tests). No objects, fields, flows, triggers, metadata records or
permission changes.

### 10.6 Validation (AmwajReact)
| Check | Result |
| --- | --- |
| Apex | **60/60** pass (deploy `0AfRR00000glXBe0AM`): ledger rules (fee and deposit, pending only while live, carried-over deposit, refunds counted once, partial refund, never negative, missing values, sale status); portfolio end to end through the org's flows as reps (sold + reserved + EOI hold on one customer; rep2 never sees it; 404 on detail); commission per sold unit (1% of $46,000 collected, not of the $400,000 price); sold unit with no eligible collections; API routing and bad ids |
| Frontend | `tsc` + `vite build` pass; ESLint 0 errors (5 pre-existing warnings); Vitest **20/20** (status wording, unit preview, commission totals and filters, amount format). UI deploy `0AfRR00000glZuz0AE` |
| **As Sarah Khazaal** (Log in as) | Customers: 3 cards; totals 1 sold, 1 reserved, 3 held, **$116,860** confirmed. *SalesUI TEST Customer 2*: A105 Sold, A106 Reserved (deposit awaiting finance), A107 Held by EOI, A108 refunded, A10 expired; confirmed $116,860 after $2,000 refunded, awaiting $82,125, price $727,800, remaining and instalments *Not recorded*, all equal to a hand calculation. Commission: A105 **$1,108.23** = 1% × $110,823 (fee $6,273 + deposit $104,550) on a $418,200 sale; not sold: A106 $46.44, A108 $13.93; customer and text filters update the totals. An admin-owned customer → "Not available to you" |
| Admin view | 31 customers, $265,288 confirmed = independent SOQL recomputation |
| Phone (390 px) | Live deployed app as Sarah in 390 px same-origin frames (the Chrome window couldn't be resized): Customers, customer overview, My commission. No horizontal overflow; the commission table becomes per-unit cards |
| Unit-tested only | Carried-over deposit and "sold with no eligible collections" (the org's validation rules prevent both in normal processing; they exist only in imported data); the hidden-records note; a user without payment field access |

Test data (sandbox, labelled "SalesUI TEST", owned by Sarah) on *SalesUI TEST Customer 2*: three new deals (renamed by the org's flow)
plus the existing deal; EOI-00000105 to 108; RES-00000029 (**Active: A105 is now Sold**); RES-00000030 (A106 held until 24 Oct 2026);
REF-00000003 (processed, $2,000; A108 released). EOI-00000107 holds A107 until 13 Oct 2026. To release: set EOI-00000107 to Expired, and
cancel RES-00000030 with a cancel reason. A105 stays Sold.

Screenshots: `portfolio-1-customers-totals-sales-user.jpg`, `portfolio-2-customer-cards-sales-user.jpg`,
`portfolio-3-customer-overview-sales-user.jpg`, `commission-1-per-sold-unit-sales-user.jpg`, `portfolio-commission-phone-390px-sales-user.jpg`.

## 11. Reservations list (Oct 2026)
**Reservations** (`/reservations`, in the top navigation after EOIs) lists the reservations the user owns or that sit on deals they own.
`GET reservations` reads them in **user mode** (Reservation__c is Private with no sharing rules, so a rep sees only their own), with
fields the user can't read left out. It returns the newest 200 and sets `truncated` when there are more.
Filters: **Live** (Submitted, PendingWithContracts), **Deposit awaiting finance** (live with `DepositVerified__c` false), **Sold** (Active),
**Cancelled** (Cancelled, Terminated) and **All**, plus a search on customer, unit, project, RES, EOI or deal. Each card shows status,
deposit state, unit, project and source EOI, net price, deposit and payment plan, and the date that matters at that stage: hold expiry
(`HoldExpiry__c`), deposit confirmation, sale (`ActivationDate__c`) or end (`CancelledDate__c`). A card opens its EOI, where the
reservation is created and shown.
Validation: Apex `AmwajSalesApiTest` (the reservation created through the API is listed with its EOI and deposit; another rep sees none;
an EOI-only rep sees an empty list), Vitest filters and search. Live as the admin: 16 reservations (11 live, 4 sold, 1 cancelled), equal
to a direct SOQL count. As Sarah: 2 (RES-00000030 live with the deposit awaiting finance, RES-00000029 sold), as expected.


## 12. EOI PDF, cleaner customer overview, demo mode and the commission dashboard (Oct 2026)

### 12.1 EOI PDF ("Generate EOI PDF")
**What the org has (inspected, nothing created):** PhiDoc Studio (`apxphi`) is installed but has **no templates**, no generation requests
and no usage; no EOI email template, Visualforce page or flow produces EOI documents. Using PhiDoc would mean creating org-side template
records, so the document is laid out **in the app** instead. No trigger or flow runs on `ContentVersion` / `ContentDocumentLink`, and no
flow reads `EOI_Document_Attached__c`: only the app's "Upload signed EOI" sets it.

**Where:** the EOI created confirmation screen, the EOI detail page header, and each unit's EOI block on the customer overview. Works for
any EOI the user can open; another rep's EOI returns "not found or not shared with you".

**How:** `GET eois/{id}/document-data` (`AmwajEoiDocumentService.documentData`, user mode) reads the **saved** EOI and its linked records
(customer person account, unit, building, project, EOI owner and the owner's recorded manager). The browser renders two bilingual A4 pages
(Arabic first, right to left, IBM Plex Sans Arabic bundled with the app, Latin digits for numbers and IDs) and turns them into a PDF
(html-to-image + jsPDF, 2.5× resolution, ~0.8 MB). The dialog shows the actual pages as the preview, with **Download PDF**
(`Amwaj-EOI-{number}.pdf`) and **Open PDF**. Generating reads only: no EOI, hold, status, signature or payment change.

**Save to Salesforce** (`POST eois/{id}/generated-document`, `saveGenerated`): offered only when the user may edit the EOI and create
files (the same rule as filing the signed EOI). Sales reps lack Edit on `EOI__c`, so they only see Download; permissions were **not**
broadened. It inserts one `ContentVersion` titled "Amwaj-EOI-… (generated, unsigned)", linked to the EOI, and **never** updates the EOI.
The EOI page lists such files under "Generated PDFs (unsigned, not signature evidence)"; they don't count as the signed EOI.

**Content and sources**
| Document field | Source |
| --- | --- |
| EOI number, created, status, hold expiry | `EOI__c.Name`, `CreatedDate`, `Status__c`, `ExpiryDate__c` |
| Full name (Arabic) / name (English) | `Account.Full_Name__pc` / `Account.Name` |
| National ID + issue date, residence ID + issue date | `NationalID__pc`, `National_ID_Date__pc`, `Residence_ID__pc`, `Residence_ID_Date__pc` |
| Governorate, district, locality, alley, house | `BillingCity` (holds the governorate in this org), `District__pc`, `Neighborhood__pc`, `Alley__pc`, `House_Number__pc` |
| Phone 1, phone 2, email | `PersonMobilePhone`, `Phone` ("Secondary Mobile"), `PersonEmail` |
| Project, building | `Project__r.Name` + `Name_Ar__c`; `Inventory__r.Building__r.Name` + `Name_Ar__c` |
| Unit, floor, type, area | `Inventory__r.Name`/`UnitCode__c`, `FloorNumber__c`, `Unit_Type__c` (+ bedrooms), `BuiltUpArea_SQM__c` |
| List price | `Inventory__r.Unit_Price__c` |
| Discount | `Discount__c` with `Approval_Status__c`: deducted **only when Approved**. A requested, pending or rejected discount is shown with its status and "not deducted, not a commercial commitment" (note: the org's `EOI__c.Unit_Price__c` formula deducts the discount even before approval, so it is not used as the net price). When `Skip_Discount_Approval__c` is set, approval sits on the reservation |
| Net price | List price less an approved discount |
| Booking fee (+ confirmed or not) | `Reservation_Fees__c` (+ `PaymentVerifiedByFinance__c`), stated as paid in addition to the unit price |
| Payment method, plan | `Payment_Method__c`, `Preferred_Payment_Plan__r.Name` |
| Signature blocks | Buyer (name pre-filled), sales representative (`Owner.Name`), sales manager (`Owner.Manager.Name`; blank if none is recorded); signature and date left empty |

**Not included (missing or unapproved), so the PDF is a labelled draft:** declaration / acknowledgement, refund restrictions, contractual
terms, bank account instructions, project logos and third-party logos. None of these is recorded in Salesforce (no fields on `Project__c`,
no custom labels, no templates). The sample paper form (Iraq Gate Lake) carries a Dorchester logo, the Baghdad Investment Commission logo,
two bank accounts and a declaration about the first payment and forfeiting the booking fee; none of it is copied. Every page says
"Draft for review — approved declaration and terms not attached" and has a faint DRAFT watermark; page 2 has a dashed box asking for the
approved wording before signing. **To finish:** supply the approved declaration and refund wording per project, verified bank details per
project, and project logos, and say where they should live (e.g. fields on `Project__c`), then they can be printed.

### 12.2 Customer overview cleanup
The blue "Paid counts only money…" panel is gone from Customers and the customer overview, and long section descriptions were shortened.
The meaning of every figure is unchanged: live mode still shows *Not recorded* for remaining payable, overdue and instalments, now with a
small ⓘ that explains why on click or tap. "Confirmed paid" has the same ⓘ for what it includes.

### 12.3 Demo mode
A deliberately inconspicuous switch in the header: the small grey dot left of the user's name (no label or tooltip, so it does not
stand out in a client presentation; screen readers announce it as "Demo data"; slightly blue when on). It is remembered per browser;
`?demo=1` / `?demo=0` in the URL also sets it for that page. Page headings carry no demo badge. When on, Customers, the customer overview,
My commission and the Overview commission card use a **frontend sample dataset** (`src/lib/demo.ts`). Nothing is written to Salesforce;
live mode never mixes in sample values. Other pages (leads, units, EOIs, reservations) stay live, except that a unit with no photo or
floor plan in Salesforce shows a bundled sample picture (`src/assets/demo/unit-photo.jpg`, `unit-floor-plan.jpg`) instead of the
"No photos in Salesforce yet" placeholder; units with real Salesforce photos show their own. Demo EOI PDFs stay marked "Demo / Sample".

- Six sample customers, every name ending "(Sample)", every record numbered `DEMO-…`, on three project names (The Gardenes, Karblaa Gate,
  The Lake): 4 sold, 2 reserved (one with the deposit awaiting finance), 1 held by EOI, 1 released with a refunded booking fee; partial,
  overdue and fully paid schedules; one $5,000 processed refund of a duplicate payment.
- Deterministic: amounts are fixed; due dates are relative to today, so statuses (overdue, upcoming) look current but never change amounts.
- Schedules: 20% down payment + 8 quarterly instalments of 10% (or a single cash payment); money received is applied in order. Booking
  fee = 1.5% of the price, on top of it.
- Cards, unit details, schedules and commission come from the same figures and reconcile (unit-tested).
- A sample unit's "Generate EOI PDF" produces a document marked "Demo / Sample" on every page (`…-DEMO.pdf`), with no Save action.

### 12.4 My commission
Clean dashboard: **Commission on collections**, **Potential remaining commission**, **Total potential commission**, **Units sold**; project,
customer and text filters (totals follow them); a per-unit table (cards on phones) with unit and project, customer, sale value, eligible
collections (with a collected-% bar), rate, commission on collections and potential remaining; reserved, held and (live) released units
in their own section that is **not** in the totals. No yellow banner, no "calculated in Salesforce", no "paid to you".

| | Live | Demo |
| --- | --- | --- |
| Calculation | Existing `AmwajCommissionService`, unchanged (proposed 1% of confirmed collections incl. booking fee, signed EOI, less refunds) | `src/lib/commissionView.ts` under the demo assumptions below |
| Remaining / total potential | *Not recorded* (instalment receipts aren't in Salesforce) | Rate × unpaid property-price balance |
| Header label | "Estimate · 1% proposed rate" | "Demo" |
| Reserved / held units | Commission on confirmed collections (live rule) | "Potential if completed" = rate × sale value |

**Demo commission assumptions (not Amwaj policy):** rate 1%; eligible base = property-price payments collected on completed (sold) units;
taxes and separate booking/admin fees excluded; processed refunds deducted from eligible collections; one salesperson per sale, no splits;
potential remaining = rate × unpaid property-price balance. Example: $200,000 sale, $50,000 collected → $500 on collections, $1,500
remaining, $2,000 total (sample unit DEMO-G-1204).

### 12.5 Where each value comes from
| Kind | Values |
| --- | --- |
| **Directly from Salesforce** | EOI, reservation, refund, deal and customer records and their fields (numbers, statuses, dates, prices, fees, deposits, discount and approval status, payment method and plan, IDs, address, phones, email); unit, building and project details; owner and manager names; the commission rate (`Amwaj_Commission_Policy__mdt`) |
| **Calculated from Salesforce data** | Live: confirmed paid, awaiting finance, refunds counted once, sold/reserved/held counts (`AmwajPaymentLedger`); live commission and per-line eligible basis (`AmwajCommissionService`); PDF net price (list − approved discount); reservations filters |
| **Simulated / assumed (demo mode only)** | Sample customers, units, deals, EOI/reservation numbers, payment schedules, receipts, due dates, overdue amounts, the $5,000 refund, remaining balances, next payments; all demo commission figures and the assumptions in 12.4; the sample EOI PDF content (sample ID, address, "Sample Sales Manager") |

### 12.6 Validation (AmwajReact)
| Check | Result |
| --- | --- |
| Apex | `AmwajEoiDocumentServiceTest`: data comes from the saved EOI and customer; another rep gets 404; reps can't save (403); only real PDFs; saving leaves status, expiry, signature flag, payment and approval unchanged and creates no EOI; requested discount keeps its approval status. Plus `AmwajSalesApiTest` (routes). All eight project test classes: **69/69** pass |
| Frontend | `tsc`, ESLint 0 errors (5 pre-existing warnings), Vitest **42/42** (PDF pricing rules incl. pending/rejected/reservation-approved discounts, file name; demo determinism, sample labelling, schedule statuses, card/unit/schedule reconciliation, search incl. local phone format, project filter; brief's commission example; booking fee excluded; refund deducted; pipeline separate; live view keeps Salesforce figures and shows no remaining; released units only while they carry commission), `vite build` |
| **As Sarah Khazaal** (Log in as) | Created **EOI-00000109** (A119, labelled TEST deal) in the app; "Generate EOI PDF" on the confirmation screen; PDF content checked field by field (USD 144,000 list and net, no discount, fee USD 2,160 not yet confirmed, hold 13/10/2026, Sarah as rep, manager blank because none is recorded), Arabic shaping and RTL correct, A4, 2 pages; no Save button (no EOI edit access); an admin-owned EOI returns "not found or not shared". EOI-00000105 and -109 unchanged afterwards (same `SystemModstamp`), EOI count unchanged (41). Demo: 6 sample customers, totals, cards, overview, schedule, sample PDF, commission totals and project filter checked against hand calculation; switching back to live resets filters and shows A105 $1,108.23 as before |
| As the admin | Existing EOI-00000105 PDF downloaded and inspected; **Save to Salesforce** on EOI-00000109 linked "Amwaj-EOI-00000109 (generated, unsigned)"; EOI unchanged; listed under "Generated PDFs (unsigned)", signed step still open |
| Phone (390 px frames) | Customers (demo), customer overview (demo), EOI page and PDF dialog, Reservations, My commission (demo and live): no horizontal overflow |
| Not verified | Discount approved / pending / rejected PDFs live (unit-tested only: a discount request starts the org's approval process, which could notify real approvers); a project with Arabic building names (none recorded); printing on paper; the PDF in Safari / iOS |

Sample PDF: `docs/samples/Amwaj-EOI-00000109-TEST.pdf` (TEST data). Screenshots: `eoi-pdf-1…4`, `cleanup-1…2`, `demo-1…5`,
`commission-demo-1…2`, `commission-live-1…2`, `phone-390px-demo-and-live-sales-user.jpg`.

Test data added: deal "SalesUI TEST Customer 2-The Gardenes" (`006RR00000YbQxdYAF`, created as "SalesUI TEST PDF deal", owned by Sarah) and
**EOI-00000109** holding A119 until 13 Oct 2026, with one generated unsigned PDF file. To release: let the hold expire (the org's
scheduled flow) or set the EOI to Expired; delete the file if not wanted.

### 12.7 Client demo walkthrough (about 6 minutes)
1. **EOIs & holds** → open an EOI → **Generate EOI PDF**: bilingual A4 preview → Download. Point out it is built from the saved record and
   marked as a draft until Amwaj's approved terms are added.
2. **New EOI** from a deal → after "EOI created", **Generate EOI PDF** straight from the confirmation.
3. Switch the header to **Demo**. **Customers**: totals strip, cards with paid / remaining / instalments / overdue.
4. Open **Layla Kareem (Sample)**: payment summary, then unit DEMO-G-1204 with its schedule (paid, part paid, overdue, upcoming).
5. **My commission**: $500 on the $50,000 collected for DEMO-G-1204, $1,500 remaining, $2,000 total; filter by The Lake; reserved and held
   units shown separately as potential.
6. Switch back to **Live** to show the real figures and that nothing sample remains.
