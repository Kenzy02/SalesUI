import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, ArrowLeft, Lock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { Tone } from '@/lib/salesLabels';

const TONES: Record<Tone, string> = {
  neutral: 'bg-stone-100 text-stone-700 ring-stone-200',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-900 ring-amber-200',
  danger: 'bg-rose-50 text-rose-800 ring-rose-200',
  brand: 'bg-brand-mist text-brand-navy ring-[#cfdaea]',
};

export function StatusPill({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap',
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand-steel">{eyebrow}</p>}
        <h1 tabIndex={-1} className="text-2xl font-semibold tracking-tight text-brand-navy outline-none sm:text-3xl">
          {title}
        </h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(20,30,60,0.04)]', className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            {title && <h2 className="text-base font-semibold text-brand-navy">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  to,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  to?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{label}</span>
        {icon && <span className="text-brand-steel" aria-hidden="true">{icon}</span>}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-brand-navy">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </>
  );
  const cls =
    'block rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(20,30,60,0.04)] transition-colors';
  return to ? (
    <Link to={to} className={cn(cls, 'hover:border-brand-steel/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      {icon && (
        <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-brand-mist text-brand-steel" aria-hidden="true">
          {icon}
        </div>
      )}
      <p className="font-medium text-brand-navy">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * Load failure. A 403 is shown as a permission problem (retrying won't help);
 * the technical detail stays available under "Details" for support.
 */
export function ErrorState({
  message,
  onRetry,
  status,
  detail,
  compact,
}: {
  message: string;
  onRetry?: () => void;
  status?: number;
  detail?: string;
  compact?: boolean;
}) {
  const permission = status === 403;
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center rounded-xl border text-center',
        compact ? 'px-3 py-5' : 'px-4 py-8',
        permission ? 'border-amber-200 bg-amber-50/70' : 'border-rose-200 bg-rose-50/60'
      )}
    >
      {permission ? (
        <Lock className="mb-2 size-6 text-amber-800" aria-hidden="true" />
      ) : (
        <AlertTriangle className="mb-2 size-6 text-rose-700" aria-hidden="true" />
      )}
      <p className={cn('font-medium', permission ? 'text-amber-950' : 'text-rose-900')}>
        {permission ? "You don't have access to this" : "We couldn't load this"}
      </p>
      <p className={cn('mt-1 max-w-md text-sm', permission ? 'text-amber-900' : 'text-rose-800')}>{message}</p>
      {permission && (
        <p className="mt-1 max-w-md text-xs text-amber-900">Ask your Salesforce administrator to check your permission sets.</p>
      )}
      {onRetry && !permission && (
        <Button variant="outline" size="lg" className="mt-4" onClick={onRetry}>
          <RefreshCw /> Try again
        </Button>
      )}
      {detail && (
        <details className="mt-3 max-w-md text-left text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Details for support</summary>
          <code className="mt-1 block break-words">{detail}</code>
        </details>
      )}
    </div>
  );
}

export function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-900">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

export function LoadingBlock({ rows = 3, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function DetailList({ items, columns = 2 }: { items: { label: string; value: ReactNode }[]; columns?: 1 | 2 | 3 }) {
  return (
    <dl
      className={cn(
        'grid gap-x-6 gap-y-3 text-sm',
        columns === 3 ? 'sm:grid-cols-3' : columns === 2 ? 'sm:grid-cols-2' : 'grid-cols-1'
      )}
    >
      {items.map(item => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="mt-0.5 break-words font-medium text-foreground">{item.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="mb-4 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-brand-steel hover:text-brand-navy focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {children}
    </Link>
  );
}

/** Link to a record in Salesforce, for steps that stay in Salesforce. */
export function salesforceRecordUrl(objectApiName: string, recordId: string): string | null {
  const orgUrl = globalThis.SFDC_ENV?.orgUrl;
  return orgUrl ? `${orgUrl.replace(/\/+$/, '')}/lightning/r/${objectApiName}/${recordId}/view` : null;
}
