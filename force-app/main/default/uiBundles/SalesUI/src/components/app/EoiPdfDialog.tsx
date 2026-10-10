/**
 * Preview, download and (where the user's access allows) save the EOI PDF.
 * The document is built from the saved EOI (`GET eois/{id}/document-data`);
 * generating it changes nothing in Salesforce. Saving only adds the file to
 * the EOI's files, marked "generated, unsigned".
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CloudUpload, Download, ExternalLink, FileText } from 'lucide-react';
import { salesApi } from '@/api/salesApi';
import { EoiDocument, A4_HEIGHT, A4_WIDTH } from '@/components/app/EoiDocument';
import { useMe } from '@/components/app/MeContext';
import {
  ErrorState,
  InlineError,
  LoadingBlock,
} from '@/components/app/Primitives';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/sonner';
import { eoiFileName, type EoiDocumentData } from '@/lib/eoiDocument';
import {
  blobToBase64,
  downloadBlob,
  loadDocumentFonts,
  pagesToPdf,
} from '@/lib/pdf';

export interface EoiPdfDialogProps {
  onClose: () => void;
  onSaved?: () => void;
  /** A saved EOI: the document is loaded from Salesforce. */
  eoiId?: string;
  /** Demo data (never saved): marked "Demo / Sample". */
  demoData?: EoiDocumentData;
}

export default function EoiPdfDialog({
  onClose,
  onSaved,
  eoiId,
  demoData,
}: EoiPdfDialogProps) {
  const me = useMe();
  const demo = !!demoData;
  const [data, setData] = useState<EoiDocumentData | null>(demoData ?? null);
  const [error, setError] = useState<string | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [busy, setBusy] = useState<'download' | 'open' | 'save' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [generatedAt] = useState(() => new Date().toISOString());
  const docRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<Blob | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);

  useEffect(() => {
    let cancelled = false;
    loadDocumentFonts()
      .catch(() => undefined)
      .finally(() => !cancelled && setFontsReady(true));
    if (!demoData && eoiId) {
      salesApi
        .eoiDocument(eoiId)
        .then(d => !cancelled && setData(d))
        .catch(
          err =>
            !cancelled &&
            setError(
              err instanceof Error
                ? err.message
                : 'The EOI could not be loaded.'
            )
        );
    }
    return () => {
      cancelled = true;
    };
  }, [eoiId, demoData]);

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const fit = () => {
      const cs = getComputedStyle(el);
      const inner =
        el.clientWidth -
        parseFloat(cs.paddingLeft) -
        parseFloat(cs.paddingRight);
      setScale(Math.min(1, Math.max(0.2, inner / A4_WIDTH)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [data, fontsReady]);

  const fileName = eoiFileName(data?.eoi.name, demo);

  const buildPdf = async (): Promise<Blob> => {
    if (pdfRef.current) return pdfRef.current;
    const pages = Array.from(
      docRef.current?.querySelectorAll<HTMLElement>('.eoidoc-page') ?? []
    );
    if (!pages.length) throw new Error('The document is not ready yet.');
    const blob = await pagesToPdf(pages, {
      title: `Amwaj EOI ${data?.eoi.name ?? ''}${demo ? ' (Demo / Sample)' : ''}`,
      subject: demo
        ? 'Demo / Sample — simulated data'
        : 'Expression of interest — draft, unsigned',
    });
    pdfRef.current = blob;
    return blob;
  };

  const run = async (kind: 'download' | 'open' | 'save') => {
    setActionError(null);
    setBusy(kind);
    // Open the tab synchronously so pop-up blockers allow it.
    const tab = kind === 'open' ? window.open('', '_blank') : null;
    try {
      const blob = await buildPdf();
      if (kind === 'download') {
        downloadBlob(blob, fileName);
      } else if (kind === 'open') {
        const url = URL.createObjectURL(blob);
        if (tab) tab.location.href = url;
        else window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 120_000);
      } else if (data && !demo) {
        await salesApi.saveGeneratedEoi(
          data.eoi.id,
          fileName,
          await blobToBase64(blob)
        );
        setSaved(true);
        onSaved?.();
        toast.success('PDF saved to the EOI in Salesforce', {
          description: 'Saved as a generated, unsigned copy.',
        });
      }
    } catch (err) {
      tab?.close();
      setActionError(
        err instanceof Error ? err.message : 'The PDF could not be created.'
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-h-[94vh] w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] gap-3 overflow-hidden p-4 sm:max-w-4xl sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-5 text-brand-steel" aria-hidden="true" />
            EOI PDF{data?.eoi.name ? ` · ${data.eoi.name}` : ''}
            {demo && (
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">
                Demo
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {demo
              ? 'Sample data for the demo. It is marked “Demo / Sample” and can’t be saved to Salesforce.'
              : 'Built from the saved EOI in Salesforce. Generating it doesn’t change the EOI.'}
          </DialogDescription>
        </DialogHeader>

        <div
          ref={frameRef}
          className="min-h-0 overflow-x-hidden overflow-y-auto rounded-lg bg-slate-200/70 p-2 sm:p-4"
          style={{ maxHeight: '62vh' }}
        >
          {error ? (
            <ErrorState message={error} />
          ) : !data || !fontsReady ? (
            <LoadingBlock rows={6} label="Preparing the document" />
          ) : (
            <div
              style={{
                width: A4_WIDTH * scale,
                height: (A4_HEIGHT * 2 + 16) * scale,
                margin: '0 auto',
              }}
            >
              <div
                className="[&_.eoidoc-page]:mb-4 [&_.eoidoc-page]:shadow-md"
                style={{
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                  width: A4_WIDTH,
                }}
              >
                <EoiDocument
                  ref={docRef}
                  data={data}
                  currency={me.currencyCode}
                  generatedAt={generatedAt}
                  demo={demo}
                />
              </div>
            </div>
          )}
        </div>

        <InlineError message={actionError} />
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <p className="text-xs text-muted-foreground sm:self-center">
            {data ? `${fileName} · A4 · 2 pages` : ''}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {!demo && data?.canSave && (
              <Button
                variant="outline"
                disabled={!!busy || saved}
                onClick={() => run('save')}
              >
                <CloudUpload />{' '}
                {saved
                  ? 'Saved to Salesforce'
                  : busy === 'save'
                    ? 'Saving…'
                    : 'Save to Salesforce'}
              </Button>
            )}
            <Button
              variant="outline"
              disabled={!data || !fontsReady || !!busy}
              onClick={() => run('open')}
            >
              <ExternalLink /> {busy === 'open' ? 'Preparing…' : 'Open PDF'}
            </Button>
            <Button
              disabled={!data || !fontsReady || !!busy}
              onClick={() => run('download')}
            >
              <Download /> {busy === 'download' ? 'Preparing…' : 'Download PDF'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
