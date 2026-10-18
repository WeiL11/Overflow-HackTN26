import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUuid } from './uuid';

afterEach(() => vi.unstubAllGlobals());

describe('createUuid', () => {
  it('uses native randomUUID when available', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'native-uuid' });
    expect(createUuid()).toBe('native-uuid');
  });

  it('creates an RFC 4122 version 4 UUID when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.set(Array.from({ length: 16 }, (_, index) => index));
        return bytes;
      },
    });
    expect(createUuid()).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
  });

  it('fails clearly when secure randomness is unavailable', () => {
    vi.stubGlobal('crypto', undefined);
    expect(() => createUuid()).toThrow('Secure random values are unavailable');
  });
});
