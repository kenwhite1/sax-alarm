/**
 * TDD-ядро антифрода (практика из «codexmaxxing»/superpowers: тесты на границы, не happy-path).
 * Запуск: npm test
 */
import { describe, it, expect } from 'vitest';
import { hamming } from '../src/services/hamming';

describe('hamming', () => {
  it('identical hashes → 0', () => {
    expect(hamming('ffffffffffffffff', 'ffffffffffffffff')).toBe(0);
  });
  it('fully different → 64', () => {
    expect(hamming('0000000000000000', 'ffffffffffffffff')).toBe(64);
  });
  it('single-bit difference → 1', () => {
    expect(hamming('0000000000000000', '0000000000000001')).toBe(1);
  });
  it('near-duplicate stays under dedup threshold (10)', () => {
    // отличие в 2 младших битах — «то же фото», должно блокироваться
    expect(hamming('a1b2c3d4e5f60708', 'a1b2c3d4e5f6070b')).toBeLessThanOrEqual(10);
  });
});

describe('dedup policy', () => {
  const MAX = 10;
  const isDup = (a: string, b: string) => hamming(a, b) <= MAX;
  it('re-sent frame is a duplicate', () => {
    expect(isDup('deadbeefdeadbeef', 'deadbeefdeadbeef')).toBe(true);
  });
  it('genuinely different scene passes', () => {
    expect(isDup('0f0f0f0f0f0f0f0f', 'f0f0f0f0f0f0f0f0')).toBe(false);
  });
});
