import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type BookingStep = 'unit' | 'customer' | 'eoi' | 'done';

/**
 * Where the rep is in the booking journey. The "Customer" step only appears
 * when the customer is still a lead (it is converted inside the app).
 */
export function BookingSteps({ current, withConversion }: { current: BookingStep; withConversion: boolean }) {
  const steps: { key: BookingStep; label: string }[] = [
    { key: 'unit', label: 'Unit and plan' },
    ...(withConversion ? [{ key: 'customer' as const, label: 'Convert lead' }] : []),
    { key: 'eoi', label: 'EOI and hold' },
    { key: 'done', label: 'Booked' },
  ];
  const at = steps.findIndex(s => s.key === current);
  return (
    <nav aria-label="Booking progress" className="mb-5">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs sm:text-sm">
        {steps.map((s, i) => {
          const done = i < at;
          const active = i === at;
          return (
            <li key={s.key} className="flex items-center gap-2" aria-current={active ? 'step' : undefined}>
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1 ring-inset',
                  done && 'bg-emerald-600 text-white ring-emerald-600',
                  active && 'bg-brand-navy text-white ring-brand-navy',
                  !done && !active && 'bg-white text-muted-foreground ring-border'
                )}
              >
                {done ? <Check className="size-3.5" aria-hidden="true" /> : i + 1}
              </span>
              <span className={cn('font-medium', active ? 'text-brand-navy' : 'text-muted-foreground')}>
                {s.label}
                {done && <span className="sr-only"> (done)</span>}
              </span>
              {i < steps.length - 1 && <span aria-hidden="true" className="mx-1 h-px w-5 bg-border sm:w-8" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
