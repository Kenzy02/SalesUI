import { Info } from 'lucide-react';
import { Popover } from 'radix-ui';

/** A small "i" that shows a short explanation on click or tap (works on phones, unlike hover tooltips). */
export function InfoTip({
  children,
  label = 'More information',
}: {
  children: string;
  label?: string;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground hover:text-brand-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Info className="size-3.5" aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-w-72 rounded-lg bg-brand-navy px-3 py-2 text-xs font-normal leading-relaxed text-white shadow-lg outline-none"
        >
          {children}
          <Popover.Arrow className="fill-brand-navy" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
