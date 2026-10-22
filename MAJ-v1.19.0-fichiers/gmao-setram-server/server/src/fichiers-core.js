// Reconnaissance des documents des rapports d'activité par leur CONTENU (jamais par l'extension ni le type annoncé).
// Logique pure, partagée avec la démonstration : octets -> { mime, ext } | { refus } | null.
const latin1 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return s; };
export function detectDocumentOctets(u8) {
  if (!u8 || u8.length < 8) return null;
  if (latin1(u8.subarray(0, 5)) === '%PDF-') return { mime: 'application/pdf', ext: 'pdf' };
  if (u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 0x03 && u8[3] === 0x04) {
    const t = latin1(u8);                                    // noms des entrées de l'archive (non compressés)
    if (t.includes('vbaProject.bin')) return { refus: 'Fichier avec macros refusé : enregistrez-le en .xlsx ou .docx sans macros.' };
    if (t.includes('xl/workbook.xml')) return { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' };
    if (t.includes('word/document.xml')) return { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' };
  }
  if ([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every((v, i) => u8[i] === v)) return { refus: 'Ancien format Office (.xls / .doc) : enregistrez-le en .xlsx ou .docx.' };
  return null;
}
