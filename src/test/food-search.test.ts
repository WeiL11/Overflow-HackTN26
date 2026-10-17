import { describe, expect, it } from 'vitest';
import { buildCatalog, keywordSearch, normalizeSearchResponse } from '../../server/searchFood.mjs';

const listing = (id: string, food_name: string, category: string, tags: string[], description = '') => ({
  id,
  food_name,
  category,
  tags,
  description,
  quantity: 10,
  location: 'Community Center',
  expiry_time: new Date(Date.now() + 24 * 3_600_000).toISOString(),
});

const listings = [
  listing('uuid-curry', 'Vegetable curry with rice', 'prepared_meals', ['vegan', 'vegetarian', 'halal', 'dinner', 'needs_refrigeration']),
  listing('uuid-padthai', 'Pad thai with tofu', 'prepared_meals', ['vegetarian', 'dinner'], 'Contains peanuts'),
  listing('uuid-chicken', 'Chicken and rice bowls', 'prepared_meals', ['halal', 'nut_free', 'dinner', 'high_protein']),
  listing('uuid-pretzels', 'Pretzel snack bags', 'snacks', ['vegan', 'vegetarian', 'nut_free', 'kid_friendly', 'snack', 'ready_to_eat']),
  listing('uuid-baby', 'Baby food jars', 'baby_kids', ['vegan', 'nut_free', 'kid_friendly']),
];

describe('buildCatalog', () => {
  it('uses short ids that map back to listing ids', () => {
    const { text, idMap } = buildCatalog(listings);
    expect(text.split('\n')).toHaveLength(listings.length);
    expect(text).toContain('L1 | Vegetable curry with rice | prepared_meals');
    expect(idMap.get('L3')).toBe('uuid-chicken');
  });
});

describe('normalizeSearchResponse', () => {
  const { idMap } = buildCatalog(listings);

  it('drops ids the model invented and duplicates', () => {
    const result = normalizeSearchResponse(
      { summary: 'Dinner', results: [{ id: 'L1', reason: 'fits' }, { id: 'L99', reason: 'made up' }, { id: 'L1', reason: 'again' }] },
      listings,
      idMap,
    );
    expect(result.results).toEqual([{ id: 'uuid-curry', reason: 'fits' }]);
  });

  it('enforces requested dietary tags and avoided tags', () => {
    const result = normalizeSearchResponse(
      {
        mustHaveTags: ['halal', 'dinner', 'not_a_tag'],
        avoidTags: ['needs_refrigeration'],
        results: [{ id: 'L1' }, { id: 'L2' }, { id: 'L3' }],
      },
      listings,
      idMap,
    );
    // L1 is halal but needs refrigeration; L2 is not halal; only L3 survives.
    expect(result.results.map(r => r.id)).toEqual(['uuid-chicken']);
    expect(result.filters.mustHaveTags).toEqual(['halal', 'dinner']);
  });

  it('backfills listings the model skipped that match its own filters', () => {
    const result = normalizeSearchResponse(
      { categories: ['prepared_meals'], mustHaveTags: ['halal', 'nut_free'], results: [] },
      listings,
      idMap,
    );
    expect(result.results).toEqual([{ id: 'uuid-chicken', reason: 'Also fits: halal, nut free' }]);
  });

  it('handles junk model output', () => {
    expect(normalizeSearchResponse(null, listings, idMap)).toMatchObject({ summary: '', results: [] });
  });
});

describe('keywordSearch', () => {
  it('requires dietary words such as "no nuts"', () => {
    const ids = keywordSearch('halal dinner, no nuts', listings).results.map(r => r.id);
    expect(ids).toEqual(['uuid-chicken']);
  });

  it('ranks listings matching the need first', () => {
    const ids = keywordSearch('snacks for my kids', listings).results.map(r => r.id);
    expect(ids[0]).toBe('uuid-pretzels');
    expect(ids).not.toContain('uuid-curry');
  });

  it('finds baby food by category', () => {
    expect(keywordSearch('something for my baby', listings).results[0].id).toBe('uuid-baby');
  });
});
