import { cn } from '@/lib/utils';
import { useDemoMode } from './DemoContext';

/**
 * A deliberately inconspicuous switch in the header: a small neutral dot with no
 * label or tooltip, so it does not stand out during a client presentation.
 * Screen readers still announce it as the "Demo data" switch.
 */
export function DemoToggle() {
  const { demo, setDemo } = useDemoMode();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={demo}
      aria-label="Demo data"
      onClick={() => setDemo(!demo)}
      className="inline-flex size-6 items-center justify-center rounded-full text-border hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span
        aria-hidden="true"
        className={cn('size-1.5 rounded-full', demo ? 'bg-brand-steel/60' : 'bg-current')}
      />
    </button>
  );
}
