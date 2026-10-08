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
Commission paid is **not tracked**.

## 4. Filters

| Screen | Filter | Field mapping | Notes |
| --- | --- | --- | --- |
| Units | Project (step 1) | `Inventory__c.Project__c` | Chips with available counts (`Project__c.AvailableUnits__c`) |
| Units | Unit type (step 2) | `Inventory__c.Unit_Type__c` | Independent picklist, no record types. Options per project come from the inventory (aggregate), with available counts. An incompatible type is cleared on project change, with a message |
| Units | Availability, bedrooms (min), zone, min/max price, search | `Status__c`, `Bedrooms__c`, `Zone__c` (per project), `Unit_Price__c`, `Name`/`UnitCode__c`/`Building__r.Name` | All server-side; count and pagination cover every match; chips + Clear filters |
| Units | Customer context | `?dealId=` / `?leadId=` | Starts from the deal's `Project__c` or the lead's `Project_Interest__c`, and the unit type of `Interested_Unit__c` (the only unit-type preference the org records). Applied once; later browsing never changes the customer record. Carried to unit detail and into the EOI form; filters kept on "Back to units" |
| My leads | Project of interest | `Lead.Project_Interest__c` or `nd_Project_of_Interest__c` | No unit-type preference field exists on leads (data gap, not invented) |
| Customers | Project | `Opportunity.Project__c` | — |

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
  --tests AmwajCommissionServiceTest --tests AmwajSalesApiTest --tests PaymentPlanViewerControllerTest
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
