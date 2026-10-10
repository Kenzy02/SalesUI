import { FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDemoMode } from './DemoContext';

/** A quiet switch in the header; when on, a small "Demo" badge is the only indicator. */
export function DemoToggle() {
  const { demo, setDemo } = useDemoMode();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={demo}
      onClick={() => setDemo(!demo)}
      title={
        demo
          ? 'Demo data is on: customers, payments and commission are sample figures. Click to return to live Salesforce data.'
          : 'Show sample customers, payment schedules and commission for a demonstration. Nothing is saved to Salesforce.'
      }
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        demo
          ? 'border-orange-300 bg-orange-50 text-orange-800 hover:bg-orange-100'
          : 'border-border bg-white text-muted-foreground hover:text-brand-navy'
      )}
    >
      <FlaskConical className="size-3.5" aria-hidden="true" />
      {demo ? 'Demo' : 'Live'}
      <span className="sr-only">
        {demo ? ' data on' : ' data. Switch to demo data'}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'relative ml-0.5 h-3.5 w-6 rounded-full transition-colors',
          demo ? 'bg-orange-500' : 'bg-slate-300'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-2.5 rounded-full bg-white transition-all',
            demo ? 'left-3' : 'left-0.5'
          )}
        />
      </span>
    </button>
  );
}

/** Inline badge for headings of pages that show sample figures. */
export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800',
        className
      )}
      title="Sample data for a demonstration, not from Salesforce"
    >
      <FlaskConical className="size-3" aria-hidden="true" /> Demo
    </span>
  );
}
