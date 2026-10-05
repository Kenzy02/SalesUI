import { useEffect, useState } from 'react';
import { Building2, ImageOff } from 'lucide-react';
import { fileObjectUrl } from '@/api/salesApi';
import type { FileRef } from '@/api/salesTypes';
import { cn } from '@/lib/utils';

/**
 * A unit image from Salesforce Files, loaded with the user's session. When the
 * unit has no photo in Salesforce, an honest placeholder says so.
 */
export function UnitPhoto({
  file,
  alt,
  className,
  showMissingLabel = true,
}: {
  file?: FileRef | null;
  alt: string;
  className?: string;
  showMissingLabel?: boolean;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    if (file?.versionId) {
      fileObjectUrl(file.versionId)
        .then(url => !cancelled && setSrc(url))
        .catch(() => !cancelled && setFailed(true));
    }
    return () => {
      cancelled = true;
    };
  }, [file?.versionId]);

  if (file && src) {
    return <img src={src} alt={alt} className={cn('h-full w-full object-cover', className)} />;
  }
  return (
    <div
      className={cn(
        'flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[linear-gradient(135deg,#eef2f8_0%,#e3e9f2_55%,#d8e1ee_100%)] text-brand-steel',
        className
      )}
    >
      {file && !failed ? (
        <span className="sr-only">Loading photo</span>
      ) : file && failed ? (
        <>
          <ImageOff className="size-7 opacity-70" aria-hidden="true" />
          {showMissingLabel && <span className="text-xs font-medium">Photo unavailable</span>}
        </>
      ) : (
        <>
          <Building2 className="size-8 opacity-60" aria-hidden="true" />
          {showMissingLabel && <span className="text-xs font-medium">No photos in Salesforce yet</span>}
        </>
      )}
    </div>
  );
}
