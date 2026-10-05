/**
 * amwajPaymentPlanViewer — two-stage "offer" experience for a unit's payment
 * plans, computed per-unit BEFORE any reservation exists.
 *
 *  Stage 1 (compare): clean offer cards — plan name, hero price, save-vs-list,
 *    duration/frequency, installment count, before/after-handover split bar.
 *    No installment rows. Responsive CSS grid (phone 1-up, tablet 2-up,
 *    desktop 3-up) — no form-factor JS.
 *  Stage 2 (focused): the selected plan takes over the WHOLE component —
 *    sticky plan header + switch pills, full numbered schedule grouped
 *    before/after handover, totals. Viewing = selected: opening a plan
 *    dispatches the flow outputs immediately.
 *
 * Hosts: Inventory__c record page (recordId) and screen flows (unitId in;
 * selectedPlanId / selectedPriceListItemId / computedNetPrice / chosenAction
 * out). Fully dynamic — renders whatever active plans the org's admins author
 * for the unit's project/wave/zone/unit; amounts come precomputed from
 * PaymentPlanViewerController (same math path as schedule generation).
 */
import { LightningElement, api, track, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { FlowAttributeChangeEvent } from 'lightning/flowSupport';
import LOCALE from '@salesforce/i18n/locale';
import DIR from '@salesforce/i18n/dir';
import getPaymentPlans from '@salesforce/apex/PaymentPlanViewerController.getPaymentPlans';
import { t, isArabic } from './labels';

const SCOPE_BADGES = {
    Zone:     { label: t('scopeZone'),     cls: 'slds-badge slds-badge_inverse' },
    Unit:     { label: t('scopeUnit'),     cls: 'slds-badge slds-theme_success' },
    Building: { label: t('scopeBuilding'), cls: 'slds-badge slds-badge_inverse' },
    Wave:     { label: t('scopeWave'),     cls: 'slds-badge slds-theme_warning' },
    Project:  { label: t('scopeProject'),  cls: 'slds-badge' }
};

const FREQ_KEYS = {
    Monthly: 'freqMonthly',
    Quarterly: 'freqQuarterly',
    SemiAnnual: 'freqSemiAnnual',
    Annual: 'freqAnnual',
    Custom: 'freqCustom'
};

export default class AmwajPaymentPlanViewer extends LightningElement {
    // ---- host wiring -------------------------------------------------------
    _recordId;
    _unitId;
    @track resolvedUnitId;

    @api
    get recordId() { return this._recordId; }
    set recordId(v) {
        this._recordId = v;
        if (v && !this._unitId) this.resolvedUnitId = v;
    }

    @api
    get unitId() { return this._unitId; }
    set unitId(v) {
        this._unitId = v;
        if (v) this.resolvedUnitId = v;
    }

    @api availableActions = [];

    // Opt-in: when true, validate() blocks Next/Finish until a plan is chosen.
    // Default false so read-only hosts (Amwaj_View_Payment_Plans) stay browsable.
    @api requirePlanSelection = false;

    // Plan to open with, e.g. the plan already chosen on the EOI. Applied once,
    // only if the plan is still offered for this unit and the user has not
    // picked one yet - after that the user is always in control.
    @api preselectedPlanId;
    _preselectApplied = false;

    // flow outputs
    @api selectedPlanId;
    @api selectedPriceListItemId;
    @api computedNetPrice;
    // Reserved output, kept for flow compatibility. The in-component
    // Pay EOI / Reserve buttons were removed (2026-07 request) — flows that
    // need a customer decision ask it with a standard flow choice instead.
    @api chosenAction;

    // ---- state -------------------------------------------------------------
    wiredResult;
    viewer;
    error;
    @track viewMode = 'compare'; // 'compare' | 'focused'

    lbl = {
        title: t('title'),
        listPrice: t('listPrice'),
        choosePlan: t('choosePlan'),
        viewPlan: t('viewPlan'),
        allPlans: t('allPlans'),
        beforeHandover: t('beforeHandover'),
        afterHandover: t('afterHandover'),
        subtotal: t('subtotal'),
        total: t('total'),
        payEoi: t('payEoi'),
        reserveDirect: t('reserveDirect'),
        estimatedNote: t('estimatedNote'),
        noPrice: t('noPrice'),
        noPlans: t('noPlans'),
        errorTitle: t('errorTitle'),
        retry: t('retry'),
        refresh: t('refresh'),
        multiplePrices: t('multiplePrices'),
        misconfigured: t('misconfigured'),
        selected: t('selected'),
        selectPlanRequired: t('selectPlanRequired'),
        noPlanToSelect: t('noPlanToSelect')
    };

    @wire(getPaymentPlans, { unitId: '$resolvedUnitId' })
    wiredViewer(value) {
        this.wiredResult = value;
        if (value.data) {
            this.viewer = value.data;
            this.error = undefined;
            this.applyPreselection();
        } else if (value.error) {
            this.error = this.msg(value.error);
            this.viewer = undefined;
        }
    }

    // ---- top-level view state ---------------------------------------------
    get isLoading() {
        return !!this.resolvedUnitId && !this.viewer && !this.error;
    }
    get hasError() { return !!this.error; }
    get hasData() { return !!this.viewer; }
    get isEmpty() {
        return this.hasData && (!this.viewer.plans || this.viewer.plans.length === 0);
    }
    get hasPlans() { return this.hasData && !this.isEmpty; }
    get isCompareMode() { return this.viewMode === 'compare'; }
    get isFocusedMode() { return this.viewMode === 'focused'; }
    get isFlowContext() { return !!this._unitId; }
    get i18nDir() { return DIR; }
    get hasNoPrice() { return this.hasData && !this.viewer.price; }
    get showMultiplePriceWarning() {
        return this.hasData && this.viewer.price && this.viewer.price.hasMultipleActiveItems;
    }

    get unitTitle() {
        if (!this.viewer || !this.viewer.unit) return '';
        const u = this.viewer.unit;
        const name = (isArabic && u.nameAr) ? u.nameAr : u.name;
        const proj = (isArabic && u.projectNameAr) ? u.projectNameAr : u.projectName;
        const base = proj ? `${name} — ${proj}` : name;
        return u.zone ? `${base} · ${t('zoneLabel')}: ${u.zone}` : base;
    }

    // Empty state: a zoned unit sees only plans for its zone, so say which zone.
    get emptyMessage() {
        const zone = this.viewer && this.viewer.unit ? this.viewer.unit.zone : null;
        return zone ? t('noPlansForZone', zone) : this.lbl.noPlans;
    }
    get unitPriceFormatted() {
        if (!this.viewer || !this.viewer.price) return '';
        return this.fmtMoney(this.viewer.price.listPrice, this.viewer.price.currencyCode);
    }

    // ---- shared per-plan view model ---------------------------------------
    mapPlanView(p) {
        const listPrice = this.viewer.price ? this.viewer.price.listPrice : null;
        const rows = (p.rows || []).map((r, idx) => this.mapRow(r, idx, p));
        const preRows = rows.filter((r) => !r.isPostHandover);
        const postRows = rows.filter((r) => r.isPostHandover);
        const badge = SCOPE_BADGES[p.specificity] || SCOPE_BADGES.Project;

        // Save vs list price (the sales argument for discounted plans)
        let saveLabel = null;
        if (listPrice && p.effectivePrice != null && p.effectivePrice < listPrice) {
            const save = listPrice - p.effectivePrice;
            saveLabel = `${t('save')} ${this.fmtMoney(save, p.currencyCode)} (${this.fmtPct(save / listPrice)})`;
        }

        // Before/after handover split
        let split = null;
        const total = p.totalAmount;
        if (total && total > 0) {
            const prePct = Math.round(((p.preHandoverAmount || 0) / total) * 100);
            split = this.buildSplit(prePct);
        } else if (rows.length) {
            let pre = 0; let all = 0;
            rows.forEach((r) => {
                const v = r.rawPct || 0;
                all += v;
                if (!r.isPostHandover) pre += v;
            });
            if (all > 0) split = this.buildSplit(Math.round((pre / all) * 100));
        }

        const chips = [];
        if (p.durationYears) {
            chips.push({ k: 'dur', label: `${p.durationYears} ${t('years')}` });
        }
        if (p.installmentFrequency && FREQ_KEYS[p.installmentFrequency]) {
            chips.push({ k: 'freq', label: t(FREQ_KEYS[p.installmentFrequency]) });
        }

        const warns = [];
        if (p.hasLaunchCheck) warns.push({ k: 'chk', cls: 'slds-badge chip', label: t('refundableCheck') });
        if (p.totalsWarning) warns.push({ k: 'tot', cls: 'slds-badge chip slds-theme_error', label: t('totalsWarning') });
        if (p.currencyMismatch) warns.push({ k: 'cur', cls: 'slds-badge chip slds-theme_warning', label: t('currencyMismatch') });

        return {
            id: p.id,
            displayName: (isArabic && p.nameAr) ? p.nameAr : p.name,
            planCode: p.planCode,
            description: (isArabic && p.descriptionAr) ? p.descriptionAr : p.description,
            badgeLabel: badge.label + (p.specificityDetail ? ` · ${p.specificityDetail}` : ''),
            badgeClass: badge.cls,
            priceFormatted: p.effectivePrice != null
                ? this.fmtMoney(p.effectivePrice, p.currencyCode) : null,
            saveLabel,
            chips,
            warns,
            hasWarns: warns.length > 0,
            isMisconfigured: p.isMisconfigured,
            misconfiguredReason: p.misconfiguredReason,
            installmentsLabel: `${p.installmentCount} ${t('installments')}`,
            split,
            preRows,
            postRows,
            hasRows: rows.length > 0,
            hasPostRows: postRows.length > 0,
            preSubtotal: p.preHandoverAmount != null
                ? this.fmtMoney(p.preHandoverAmount, p.currencyCode) : null,
            postSubtotal: p.postHandoverAmount != null
                ? this.fmtMoney(p.postHandoverAmount, p.currencyCode) : null,
            totalFormatted: p.totalAmount != null
                ? this.fmtMoney(p.totalAmount, p.currencyCode) : null
        };
    }

    buildSplit(prePctInt) {
        const pre = Math.max(0, Math.min(100, prePctInt));
        const post = 100 - pre;
        return {
            preStyle: `width:${pre}%`,
            postStyle: `width:${post}%`,
            hasPost: post > 0,
            label: post > 0
                ? `${pre}% ${t('beforeHandoverShort')} · ${post}% ${t('afterShort')}`
                : `100% ${t('beforeHandoverShort')}`
        };
    }

    mapRow(r, idx, plan) {
        const fallbackType = r.installmentType ? t('type' + r.installmentType) : '';
        const label = isArabic
            ? (r.labelAr || r.label || fallbackType)
            : (r.label || fallbackType);
        return {
            key: `${plan.id}-${idx}`,
            seq: r.seq,
            displayLabel: label,
            timing: r.dueDate ? this.fmtDate(r.dueDate) : this.timingWord(r),
            pctFormatted: this.fmtPct(r.pct),
            rawPct: r.pct,
            amountFormatted: r.amount != null ? this.fmtMoney(r.amount, plan.currencyCode) : null,
            isPostHandover: r.isPostHandover,
            refundableLabel: r.isRefundable ? t('refundableCheck') : null
        };
    }

    timingWord(r) {
        const trig = r.dueTrigger;
        if (trig === 'Booking') return t('atBooking');
        if (trig === 'SPASigning') return t('atSpaSigning');
        if (trig === 'Handover' || trig === 'FinalSettlement') return t('atHandover');
        if (trig === 'PostHandoverMonth') return t('afterHandoverShort');
        if (trig === 'DaysAfterBooking' || trig === 'MonthsAfterBooking'
            || trig === 'ConstructionMilestone') return t('afterBookingShort');
        return '';
    }

    // ---- stage 1: compare -------------------------------------------------
    get comparePlans() {
        if (!this.hasPlans) return [];
        return this.viewer.plans.map((p) => this.mapPlanView(p));
    }

    // ---- stage 2: focused -------------------------------------------------
    get focusedPlan() {
        if (!this.hasPlans || !this.selectedPlanId) return null;
        const raw = this.viewer.plans.find((p) => p.id === this.selectedPlanId);
        return raw ? this.mapPlanView(raw) : null;
    }

    get switchPills() {
        if (!this.hasPlans) return [];
        return this.viewer.plans.map((p) => {
            const current = p.id === this.selectedPlanId;
            const name = (isArabic && p.nameAr) ? p.nameAr : p.name;
            return {
                id: p.id,
                label: p.planCode || name,
                title: name,
                current: current ? 'true' : 'false',
                cls: 'pill' + (current ? ' pill_current' : '')
            };
        });
    }

    get showPills() { return this.switchPills.length > 1; }

    get allPlansLabel() {
        const n = this.hasPlans ? this.viewer.plans.length : 0;
        return `${this.lbl.allPlans} (${n})`;
    }

    // ---- selection (viewing = selected) -----------------------------------
    handleOpenPlan(event) {
        const planId = event.currentTarget.dataset.planId;
        this.selectPlan(planId);
        this.viewMode = 'focused';
    }

    handleSwitchPlan(event) {
        this.selectPlan(event.currentTarget.dataset.planId);
    }

    handleBackToCompare() {
        this.viewMode = 'compare';
    }

    applyPreselection() {
        if (this._preselectApplied || this.selectedPlanId || !this.preselectedPlanId) return;
        if (!this.hasPlans) return;
        // tolerate a 15- vs 18-character Id coming from the host
        const key = String(this.preselectedPlanId).substring(0, 15);
        const match = (this.viewer.plans || []).find((p) => String(p.id).substring(0, 15) === key);
        if (!match) return; // that plan is no longer offered for this unit - let the user choose
        this._preselectApplied = true;
        this.selectPlan(match.id);
    }

    selectPlan(planId) {
        this.selectedPlanId = planId;
        if (this.isFlowContext) {
            const plan = (this.viewer.plans || []).find((p) => p.id === planId);
            const priceItemId = this.viewer.price ? this.viewer.price.priceListItemId : null;
            this.selectedPriceListItemId = priceItemId;
            this.computedNetPrice = plan && plan.effectivePrice != null
                ? String(plan.effectivePrice) : '';
            this.dispatchEvent(new FlowAttributeChangeEvent('selectedPlanId', planId));
            this.dispatchEvent(new FlowAttributeChangeEvent('selectedPriceListItemId', priceItemId));
            this.dispatchEvent(new FlowAttributeChangeEvent('computedNetPrice', this.computedNetPrice));
        }
    }

    // ---- flow validation ---------------------------------------------------
    /**
     * Called by Flow when the user presses Next / Finish. A custom LWC is NOT
     * covered by the screen's "Required" toggle - this hook is the only way to
     * block navigation. Flow does not call validate() on components hidden by a
     * visibility rule, so the cash path (viewer hidden) is unaffected.
     */
    @api
    validate() {
        if (!this.isFlowContext || !this.requirePlanSelection || this.selectedPlanId) return { isValid: true };
        return {
            isValid: false,
            errorMessage: (this.hasPlans || this.isLoading)
                ? this.lbl.selectPlanRequired
                : this.lbl.noPlanToSelect
        };
    }

    handleRefresh() {
        if (this.wiredResult) refreshApex(this.wiredResult);
    }

    // ---- formatting --------------------------------------------------------
    fmtMoney(amount, currencyCode) {
        if (amount === null || amount === undefined) return '';
        try {
            return new Intl.NumberFormat(LOCALE, {
                style: 'currency',
                currency: currencyCode || 'USD',
                maximumFractionDigits: 0
            }).format(amount);
        } catch (e) {
            return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(amount)
                + (currencyCode ? ` ${currencyCode}` : '');
        }
    }

    fmtPct(dec) {
        if (dec === null || dec === undefined) return null;
        try {
            return new Intl.NumberFormat(LOCALE, {
                style: 'percent',
                maximumFractionDigits: 2
            }).format(dec);
        } catch (e) {
            return Math.round(dec * 10000) / 100 + '%';
        }
    }

    fmtDate(d) {
        if (!d) return '';
        try {
            return new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium' })
                .format(new Date(d));
        } catch (e) {
            return String(d);
        }
    }

    // ---- error plumbing (house pattern) -----------------------------------
    msg(e) {
        return (e && e.body && e.body.message) ? e.body.message
            : (e && e.message) ? e.message : 'Unexpected error';
    }
    toast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}