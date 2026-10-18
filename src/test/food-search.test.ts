import { describe, expect, it } from 'vitest';
import { buildCatalog, extractJson, keywordSearch, maxMilesFromText, normalizeSearchResponse } from '../../server/searchFood.mjs';

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
  listing('uuid-curry', 'Vegetable curry with rice', 'prepared_meals', ['vegan', 'vegetarian', 'halal', 'warm', 'small_meal']),
  listing('uuid-padthai', 'Pad thai with tofu', 'prepared_meals', ['vegetarian', 'warm', 'small_meal'], 'Contains peanuts'),
  listing('uuid-chicken', 'Chicken and rice bowls', 'prepared_meals', ['halal', 'nut_free', 'cold', 'large_meal']),
  listing('uuid-pretzels', 'Pretzel snack bags', 'snacks', ['vegan', 'vegetarian', 'nut_free', 'cold', 'snack']),
  listing('uuid-baby', 'Baby food jars', 'baby_kids', ['vegan', 'nut_free', 'cold', 'small_meal']),
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
        mustHaveTags: ['halal', 'large_meal', 'not_a_tag'],
        avoidTags: ['warm'],
        results: [{ id: 'L1' }, { id: 'L2' }, { id: 'L3' }],
      },
      listings,
      idMap,
    );
    // L1 is halal but must be heated; L2 is not halal; only L3 survives.
    expect(result.results.map(r => r.id)).toEqual(['uuid-chicken']);
    expect(result.filters.mustHaveTags).toEqual(['halal', 'large_meal']);
  });

  it('backfills listings the model skipped that match its own filters', () => {
    const result = normalizeSearchResponse(
      { categories: ['prepared_meals'], mustHaveTags: ['halal', 'nut_free'], results: [] },
      listings,
      idMap,
    );
    expect(result.results).toEqual([{ id: 'uuid-chicken', reason: 'Also fits: halal, nut free' }]);
  });

  it('only backfills listings with every requested tag', () => {
    const result = normalizeSearchResponse(
      { categories: ['prepared_meals'], mustHaveTags: ['vegetarian', 'warm', 'small_meal'], results: [] },
      listings,
      idMap,
    );
    expect(result.results.map(r => r.id)).toEqual(['uuid-curry', 'uuid-padthai']);
  });

  it('never treats dietary tags as things to avoid', () => {
    const result = normalizeSearchResponse(
      { mustHaveTags: ['vegetarian'], avoidTags: ['vegan', 'cold'], results: [{ id: 'L1' }] },
      listings,
      idMap,
    );
    expect(result.filters.avoidTags).toEqual(['cold']);
    // The vegan curry stays (vegan is not avoided); the warm vegetarian pad thai is backfilled;
    // the cold vegan pretzels are excluded.
    expect(result.results.map(r => r.id)).toEqual(['uuid-curry', 'uuid-padthai']);
  });

  it('handles junk model output', () => {
    expect(normalizeSearchResponse(null, listings, idMap)).toMatchObject({ summary: '', results: [] });
  });
});

describe('keywordSearch', () => {
  it('requires dietary words such as "no nuts"', () => {
    const ids = keywordSearch('halal food for my family, no nuts', listings).results.map(r => r.id);
    expect(ids).toEqual(['uuid-chicken']);
  });

  it('ranks listings matching the need first', () => {
    const ids = keywordSearch('snacks for my kids', listings).results.map(r => r.id);
    expect(ids[0]).toBe('uuid-pretzels');
    expect(ids).not.toContain('uuid-curry');
  });

  it('ranks cold food first when the person cannot cook', () => {
    const results = keywordSearch("I can't cook and have no microwave", listings).results;
    expect(results.length).toBeGreaterThan(0);
    expect(results.every(r => listings.find(l => l.id === r.id)?.tags.includes('cold'))).toBe(true);
  });

  it('finds baby food by category', () => {
    expect(keywordSearch('something for my baby', listings).results[0].id).toBe('uuid-baby');
  });
});

describe('extractJson', () => {
  it('reads the first object and ignores trailing text', () => {
    const text = 'Sure!\n{"summary": "a {b} \\"c\\"", "results": [{"id": "L1"}]}\n\nNote: {not json}';
    expect(extractJson(text)).toEqual({ summary: 'a {b} "c"', results: [{ id: 'L1' }] });
  });

  it('throws when there is no JSON', () => {
    expect(() => extractJson('no json here')).toThrow();
  });
});

describe('distance limits', () => {
  const near = { lat: 36.1447, lng: -86.8027 }; // Vanderbilt
  const placed = [
    { ...listings[3], latitude: 36.1530, longitude: -86.7980 }, // pretzels, ~0.6 mi
    { ...listings[4], latitude: 36.1260, longitude: -86.7900 }, // baby food, ~1.5 mi
    { ...listings[0], latitude: null, longitude: null }, // curry, unknown
  ];
  const { idMap } = buildCatalog(placed, Date.now(), near);

  it('reads limits written in the query', () => {
    expect(maxMilesFromText('vegan food within 2 miles')).toBe(2);
    expect(maxMilesFromText('under 1.5 mi please')).toBe(1.5);
    expect(maxMilesFromText('within 5 km')).toBeCloseTo(3.1, 1);
    expect(maxMilesFromText('near me')).toBeNull();
  });

  it('drops model picks beyond maxMiles or without coordinates', () => {
    const result = normalizeSearchResponse({ maxMiles: 1, results: [{ id: 'L1' }, { id: 'L2' }, { id: 'L3' }] }, placed, idMap, near);
    expect(result.results.map(r => r.id)).toEqual(['uuid-pretzels']);
    expect(result.filters.maxMiles).toBe(1);
  });

  it('falls back to the limit in the query when the model omits it', () => {
    const result = normalizeSearchResponse({ results: [{ id: 'L1' }, { id: 'L2' }] }, placed, idMap, near, 'within 1 mile');
    expect(result.results.map(r => r.id)).toEqual(['uuid-pretzels']);
  });

  it('backfills the nearest matching listing when the model only picked far-away ones', () => {
    const halal = [
      { ...listings[2], latitude: 36.1640, longitude: -86.8420 }, // chicken bowls, halal, ~2.1 mi
      { ...listings[0], id: 'uuid-beans', tags: ['vegan', 'halal', 'nut_free'], latitude: 36.1530, longitude: -86.7980 }, // ~0.6 mi
    ];
    const catalog = buildCatalog(halal, Date.now(), near);
    const result = normalizeSearchResponse(
      { mustHaveTags: ['halal', 'nut_free'], maxMiles: 2, results: [{ id: 'L1' }] },
      halal,
      catalog.idMap,
      near,
    );
    expect(result.results.map(r => r.id)).toEqual(['uuid-beans']);
  });

  it('applies the limit in keyword search too', () => {
    expect(keywordSearch('anything within 1 mile', placed, near).results.map(r => r.id)).toEqual(['uuid-pretzels']);
  });
});
