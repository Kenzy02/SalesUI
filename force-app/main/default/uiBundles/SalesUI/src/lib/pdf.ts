/**
 * Renders A4 page nodes into a PDF in the browser. The browser lays out the
 * Arabic text (shaping, right to left) with the bundled IBM Plex Sans Arabic
 * font; each page is captured at print resolution and placed on an A4 page.
 * Loaded on demand so the PDF libraries are not part of the main bundle.
 */
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-700.css';
import '@fontsource/ibm-plex-sans-arabic/latin-400.css';
import '@fontsource/ibm-plex-sans-arabic/latin-500.css';
import '@fontsource/ibm-plex-sans-arabic/latin-600.css';
import '@fontsource/ibm-plex-sans-arabic/latin-700.css';
import { toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';

const A4_MM = { w: 210, h: 297 };

/** Make sure the document font is loaded before anything is measured or captured. */
export async function loadDocumentFonts(): Promise<void> {
  const weights = ['400', '500', '600', '700'];
  await Promise.all(
    weights.flatMap(w => [
      document.fonts.load(`${w} 16px "IBM Plex Sans Arabic"`, 'أمواج'),
      document.fonts.load(`${w} 16px "IBM Plex Sans Arabic"`, 'Amwaj 0123'),
    ])
  );
}

export interface PdfInfo {
  title: string;
  subject?: string;
}

export async function pagesToPdf(
  pages: HTMLElement[],
  info: PdfInfo
): Promise<Blob> {
  await loadDocumentFonts();
  const pdf = new jsPDF({
    unit: 'mm',
    format: 'a4',
    orientation: 'portrait',
    compress: true,
  });
  pdf.setProperties({
    title: info.title,
    subject: info.subject ?? '',
    creator: 'Amwaj Sales Workspace',
    author: 'Amwaj Sales Workspace',
  });
  for (let i = 0; i < pages.length; i++) {
    const node = pages[i];
    const image = await toJpeg(node, {
      quality: 0.92,
      pixelRatio: 2.5,
      backgroundColor: '#ffffff',
      width: node.offsetWidth,
      height: node.offsetHeight,
      cacheBust: false,
    });
    if (i > 0) pdf.addPage('a4', 'portrait');
    pdf.addImage(image, 'JPEG', 0, 0, A4_MM.w, A4_MM.h, undefined, 'FAST');
  }
  return pdf.output('blob');
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('The PDF could not be read.'));
    reader.readAsDataURL(blob);
  });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
