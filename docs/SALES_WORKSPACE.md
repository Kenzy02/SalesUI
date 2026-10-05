# Amwaj Sales Workspace (SalesUI)

React 19 / Vite UI Bundle (`force-app/main/default/uiBundles/SalesUI`) backed by an Apex REST API
(`/services/apexrest/amwaj/sales/v1`, class `AmwajSalesApi`). Verified against the **AmwajReact** org:
`00DRR00000WVnGo2AL`, *Amwaj Iraq*, **sandbox** (`IsSandbox = true`), Enterprise Edition, single currency **USD**,
time zone Asia/Baghdad.

## Architecture

| Layer | What | Why |
| --- | --- | --- |
| React | Calls the API with `@salesforce/platform-sdk` `fetch` (session auth + CSRF token for `apexrest`). | Supported, authenticated path; no tokens in client code. |
| `AmwajSalesReadService` | Reads. SELECT lists contain only fields the user can read; every query is `WITH USER_MODE`. | Sharing, object access and FLS apply. "My" = `UserInfo.getUserId()`, never a client id. |
| `AmwajOfferService` | EOI and reservation creation, signed-EOI upload. | Mirrors the org's screen flows `New_EOI_From_Opportunity` / `New_Reservation_From_Opportunity`. |
| `AmwajLeadService` | Lead status/rating/notes, calls and follow-ups (Tasks). | User-mode DML, so the org's validation rules apply unchanged. |
| `AmwajCommissionService` | Commission calculated on request from finance-confirmed records. | Nothing stored, nothing client-supplied. Rate in `Amwaj_Commission_Policy__mdt.Default` (1%). |
| `PaymentPlanViewerController` (existing) | Price and payment-plan eligibility. | Reused as the single pricing authority (same logic as `amwajPaymentPlanViewer`). |

Classes are API 67.0, where Apex database operations default to **user mode**. System mode is used only where the
org's flows run in system mode (`SystemModeWithoutSharing`), and only after a user-context access check.

## Verified org-to-UI mapping

| Feature | Objects / fields | Existing org logic | UI |
| --- | --- | --- | --- |
| My leads | `Lead` (OWD Private), `Status` New/Working/Qualified/Unqualified, `Project_Interest__c`, `DesiredUnitArea__c` | Round-robin assignment flow; role-based validation rules on owner/status changes | My leads list + detail; status/rating/notes edit (FLS-gated) |
| Customers | `Opportunity` (Private) on Person Accounts; stages Working → EOI → Contracting → Closed | Stage moved by EOI/Reservation flows | Customers list + detail; "Start EOI" |
| Units | `Inventory__c` (status Available/Held/Reserved/Sold…), `Project__c`, `Building__c`, `Zone__c` | Inventory flow syncs `PriceListItem__c` price | Card/list views, filters (project, status, type, bedrooms, zone, price, search) |
| Pricing & plans | `PriceList__c`, `PriceListItem__c.List_Price_2__c`, `PaymentPlan__c` (zone lists), `PaymentPlanInstallment__c` (fractional %) | `PaymentPlanViewerController` | Unit detail price + plan schedules |
| Offer = **EOI** | `EOI__c` (Submitted/Paid/Expired/Refunded), `Reservation_Fees__c` = 1.5% of list price | Create → unit `Held`, expiry = today + `PackageSettings__c.EOI_Period_Days__c` (**3**); discount → approval (≤5% Discount_Approvers, >5% Sales Director) | "Start an EOI and hold a unit" |
| Signature | `EOI_Document_Attached__c`, files | Required to leave Submitted; no e-signature in use (PhiDoc installed, 0 templates/requests) | Signed EOI section: files on the EOI, upload if permitted |
| Payment | `PaymentVerifiedByFinance__c` | Before-save flow sets Paid | Progress step "Booking fee confirmed by finance" |
| 14-day hold | `Reservation__c.HoldExpiry__c` = today + `DefaultHoldDays__c` (**14**) | Needs Paid EOI; deposit verified → PendingWithContracts/Reserved; contract doc → Active/Sold/Closed Won | "Reserve unit (14-day hold)" on paid EOIs |
| Commission | none existed (`Opportunity.SalesCommissionAmount__c` is unused and rep-editable) | — | My commission (calculated) |
| Media | none in org (0 Files on Project/Building/Inventory; CMS holds only bundle sources) | — | Honest "No photos in Salesforce yet"; Files on unit/building/project are shown privately when added (title containing "floor plan" = floor plan) |

## Business-rule conflicts and decisions

Resolved during this work (with approval):
1. **Price lists had blank Effective From**, so the existing viewer returned no price for any unit. Fixed
   `PaymentPlanViewerController` to treat blank as "effective now" (consistent with its plan logic).

Open decisions for Amwaj:
1. **Hold length.** Requested: the offer holds the unit for 14 days. Org: the EOI holds for **3 days**; the 14-day hold is on
   the **reservation**, which requires a paid EOI. The app follows the org. Change `EOI_Period_Days__c` if 14 days is wanted at EOI.
2. **Hold expiry is not automatic.** The scheduled flow only flags `Due__c` and sends a 2-day warning. Units stay Held
   (22 such EOIs exist in the sandbox). Reservations have no expiry automation at all, and `HoldExpiryFuture` references a
   non-existent "Held" status. Smallest change: have the scheduled flow set `Status__c = Expired` (the existing after-save
   flow then releases the unit), plus an equivalent for reservations. Decide who may extend holds (reps can edit `ExpiryDate__c` today).
3. **What counts as "signed".** The app uses `EOI_Document_Attached__c` (signed document on file). Confirm, or adopt PhiDoc e-signature.
4. **Who files the signed EOI.** The Sales Executive PS has **no Edit on `EOI__c`** (but edit on `EOI_Document_Attached__c`), so
   reps cannot file it; the app hides the upload for them. Also, `EOI_Attachment_Screen` links the file to a
   `CustomerDocument__c` that a scheduled path deletes 2 minutes later, leaving the EOI without a linked file.
5. **Tax** is not recorded anywhere; commission includes property payments and booking fees only and shows tax as "Not recorded".
6. **Commission policy details (assumptions to confirm):** cash basis (confirmed receipts minus *processed* refunds, so an
   expired/cancelled deal keeps commission until a refund is processed); attribution to the **deal owner** at calculation time;
   no splits; single currency. **Commission paid** is not tracked in Salesforce.
7. **Follow-up activities.** Reps' profile + PS give no read access to `Task.WhoId/WhatId/ActivityDate`, so calls/follow-ups are
   disabled for reps (works for users with access). Smallest change: grant those Task fields (read/edit) to sales executives.
8. **Access gaps to review:** Sales Exec PS grants edit on `Reservation__c.DepositVerified__c` (a finance action) and on
   `Opportunity.SalesCommissionAmount__c`.
9. **Data gaps:** Iraq Gate has no active payment plans (its units can't be offered); no lead has ever been converted (Company =
   "Individual" on all leads); all deals are owned by the admin user, so reps currently see no customers or commission.

## Validation

| Check | Result |
| --- | --- |
| Apex (`AmwajOfferServiceTest`, `AmwajCommissionServiceTest`, `AmwajSalesApiTest`, `PaymentPlanViewerControllerTest`) | **38/38 pass** in the sandbox (across the two deployments), run as real-permission sales users (`Amwaj User` + `Amwaj_SalesExec_PS` + `SalesUI_Access`) |
| Covered by tests | own-leads scoping and peer isolation (404); EOI create → unit Held, 3-day expiry, 1.5% fee, KYC written; second rep on the same unit → 409, nothing written; retry → same EOI; invalid ID/mobile/discount/plan/sold unit/pre-launch project rejected with no writes; reservation requires Paid, 14-day hold, down payment via org subflow; reps refused signed-EOI upload (403); commission 1% of confirmed amounts, zero when signed without collections, pre-signing collections count once signed, later confirmations counted once, refunds deducted, owner-only |
| React | `tsc` + `vite build` pass; ESLint 0 errors (5 advisory warnings); Vitest 4/4 |
| Live browser (sandbox, as the admin user) | Overview, units, unit detail, EOI creation (EOI-00000099, unit held until 8 Oct, fee $3,888), validation messages, reservation (RES-00000028, hold to 19 Oct, deposit $64,800), commission $38.88 → $686.88 after deposit confirmation. Test records were then closed: unit A9 back to Available, deal Closed Lost. |
| Not exercised | Running the UI as an actual sales rep in a browser (no rep login used); true parallel requests (serialised by `FOR UPDATE`, covered logically by tests); refunds/Processed refund requests live; media display (no files exist); phone-width layout in a browser; Playwright e2e (browsers not installed). |

## Deploy

```bash
cd force-app/main/default/uiBundles/SalesUI && npm install && npm run build && cd -
sf project deploy start -o <alias> \
  --source-dir force-app/main/default/classes \
  --source-dir force-app/main/default/objects/Amwaj_Commission_Policy__mdt \
  --source-dir force-app/main/default/customMetadata \
  --source-dir force-app/main/default/permissionsets/SalesUI_Access.permissionset-meta.xml \
  --source-dir force-app/main/default/uiBundles/SalesUI \
  --test-level RunSpecifiedTests --tests AmwajOfferServiceTest --tests AmwajCommissionServiceTest \
  --tests AmwajSalesApiTest --tests PaymentPlanViewerControllerTest
```
Users need `SalesUI_Access` (grants the app and `AmwajSalesApi` only) plus their existing sales permission set.
Local preview: `npm run dev` in the bundle folder (proxies to the default org as the CLI user).

## Manager demo (about 5 minutes)

1. **Overview** – personal counts, unit holds with expiry, EOIs needing action, commission. Point out holds past expiry: the open decision on automatic release.
2. **Units** – filter by project and bedrooms; open a Gardenes unit: live price and the org's payment plans, with an honest no-photo state.
3. **Start EOI** – choose a customer deal; required customer details are checked as the org's flow does. Submitting without confirmation is blocked. Create: Salesforce returns the fee, net price and hold date.
4. **EOI page** – progress (signed EOI → finance → reservation), the signed file as evidence, then "Reserve unit (14-day hold)".
5. **My commission** – itemised property payments / booking fees / tax (not recorded) / refunds, per-EOI states, "paid: not tracked".
6. Close with the decisions list above.
