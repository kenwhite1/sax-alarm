/**
 * Perceptual hash (dHash 8x8 → 64 бита) + расстояние Хэмминга.
 * Тот же алгоритм реализован на клиенте (frontend/src/lib/phash.ts) —
 * сервер пересчитывает хэш сам и клиентскому значению не доверяет.
 */
import sharp from 'sharp';
export { hamming } from './hamming.js';

export async function dhash(buf: Buffer): Promise<string> {
  const { data } = await sharp(buf)
    .grayscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let bits = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits += data[y * 9 + x] > data[y * 9 + x + 1] ? '1' : '0';
    }
  }
  return BigInt('0b' + bits).toString(16).padStart(16, '0');
}
