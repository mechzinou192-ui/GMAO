// Réduit une photo avant envoi : un téléphone produit 3 à 8 Mo ; en JPEG 1600 px max (~200-400 Ko) elle reste lisible
// et ne sature ni le réseau ni le disque. L'orientation EXIF est appliquée par le navigateur au décodage.
export const MAX_COTE = 1600;
export const QUALITE = 0.8;

export function dimensionsReduites(w, h, max = MAX_COTE) {
  if (!(w > 0 && h > 0)) throw new Error('Image illisible.');
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

export async function reduirePhoto(file) {
  if (!file || !/^image\//.test(file.type || '')) throw new Error('Choisissez une image (photo).');
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error("Cette image n'a pas pu être lue (format non pris en charge par ce navigateur)."); }
  const { w, h } = dimensionsReduites(bmp.width, bmp.height);
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', QUALITE));
  if (!blob) throw new Error('La photo n\'a pas pu être préparée.');
  return blob;
}
