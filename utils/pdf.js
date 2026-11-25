import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

export function criarPdf(opcoes = {}) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, ...opcoes });
  doc.registerFont(
    'Regular',
    fileURLToPath(new URL('../assets/fonts/DejaVuSans.ttf', import.meta.url))
  );
  doc.registerFont(
    'Negrito',
    fileURLToPath(new URL('../assets/fonts/DejaVuSans-Bold.ttf', import.meta.url))
  );
  doc.font('Regular');
  return doc;
}

export function finalizarPdf(doc) {
  return new Promise((resolve, reject) => {
    const partes = [];
    doc.on('data', (parte) => partes.push(parte));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.end();
  });
}
