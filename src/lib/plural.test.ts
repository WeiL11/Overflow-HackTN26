import { describe, expect, it } from 'vitest';
import { formatCount, pluralize } from './plural';

describe('plural utilities', () => {
  it('uses the singular form only for one', () => {
    expect(pluralize(1, 'item')).toBe('item');
    expect(pluralize(0, 'item')).toBe('items');
    expect(pluralize(2, 'item')).toBe('items');
  });

  it('supports irregular plurals and formatted counts', () => {
    expect(pluralize(2, 'person', 'people')).toBe('people');
    expect(formatCount(1, 'item')).toBe('1 item');
    expect(formatCount(3, 'person', 'people')).toBe('3 people');
  });
});
