/**
 * dHash 8x8 на клиенте — для быстрой прекроверки дубликата до отправки
 * (мгновенный UX-отказ). Сервер пересчитывает хэш сам и клиенту не доверяет.
 * Алгоритм идентичен backend/src/services/phash.ts.
 */

export function dhashFromCanvas(source: HTMLCanvasElement | HTMLVideoElement): string {
  const c = document.createElement('canvas');
  c.width = 9; c.height = 8;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(source, 0, 0, 9, 8);
  const { data } = g.getImageData(0, 0, 9, 8);

  const gray = new Array<number>(72);
  for (let i = 0; i < 72; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  let bits = '';
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++)
      bits += gray[y * 9 + x] > gray[y * 9 + x + 1] ? '1' : '0';

  return BigInt('0b' + bits).toString(16).padStart(16, '0');
}

export function hamming(aHex: string, bHex: string): number {
  let x = BigInt('0x' + aHex) ^ BigInt('0x' + bHex);
  let d = 0;
  while (x) { d += Number(x & 1n); x >>= 1n; }
  return d;
}
