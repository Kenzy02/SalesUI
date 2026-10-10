import { lazy, Suspense, useState } from 'react';
import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EoiDocumentData } from '@/lib/eoiDocument';

// The PDF libraries and the Arabic font load only when a document is generated.
const EoiPdfDialog = lazy(() => import('./EoiPdfDialog'));

export function GenerateEoiPdfButton({
  eoiId,
  demoData,
  size = 'lg',
  variant = 'outline',
  className,
  onSaved,
}: {
  eoiId?: string;
  demoData?: EoiDocumentData;
  size?: 'default' | 'sm' | 'lg';
  variant?: 'default' | 'outline' | 'ghost';
  className?: string;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size={size}
        variant={variant}
        className={className}
        onClick={() => setOpen(true)}
      >
        <FileDown /> Generate EOI PDF
      </Button>
      {open && (
        <Suspense fallback={null}>
          <EoiPdfDialog
            eoiId={eoiId}
            demoData={demoData}
            onSaved={onSaved}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}
