/** Расстояние Хэмминга между двумя 64-битными hex-хэшами. Без зависимостей — тестируется изолированно. */
export function hamming(aHex: string, bHex: string): number {
  let x = BigInt('0x' + aHex) ^ BigInt('0x' + bHex);
  let d = 0;
  while (x) {
    d += Number(x & 1n);
    x >>= 1n;
  }
  return d;
}
