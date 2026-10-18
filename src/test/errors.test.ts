import { describe, expect, it } from 'vitest';
import { errorMessage } from '@/lib/errors';

describe('errorMessage', () => {
  it('reads Supabase-style error objects', () => {
    expect(errorMessage({ code: 'P0001', message: 'Only recipients can request food' }, 'Unable to reserve food.')).toBe('Only recipients can request food');
  });

  it('reads Error instances and falls back otherwise', () => {
    expect(errorMessage(new Error('boom'), 'fallback')).toBe('boom');
    expect(errorMessage(null, 'fallback')).toBe('fallback');
    expect(errorMessage({ message: '' }, 'fallback')).toBe('fallback');
  });
});
