// utils/photoCapture.js
// Helpers for capturing photos and compressing them for IndexedDB storage.
// Output is a base64 data URL — safe to store directly on a transaction record.

const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 0.72;

/**
 * Compress an image File to a base64 JPEG data URL.
 * - Auto-orients via Canvas (browser handles EXIF orientation in most cases)
 * - Resizes so the longer side <= MAX_DIMENSION
 * - Encodes as JPEG at JPEG_QUALITY
 *
 * Returns a Promise<string> (data:image/jpeg;base64,...)
 * Throws on read/decode errors.
 */
export function compressPhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file provided'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      reject(new Error('Not an image file'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not decode image'));
      img.onload = () => {
        try {
          let { width, height } = img;
          const max = Math.max(width, height);
          if (max > MAX_DIMENSION) {
            const ratio = MAX_DIMENSION / max;
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
          resolve(dataUrl);
        } catch (err) {
          reject(err);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Returns the approximate byte size of a base64 data URL.
 */
export function photoSizeBytes(dataUrl) {
  if (!dataUrl) return 0;
  const idx = dataUrl.indexOf(',');
  if (idx === -1) return 0;
  const b64 = dataUrl.substring(idx + 1);
  return Math.floor((b64.length * 3) / 4);
}
