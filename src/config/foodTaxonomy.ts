// Display labels for food_listings.category and food_listings.tags.
// Keep keys in sync with the category/tags migration and server/searchFood.mjs.

export const CATEGORY_LABELS: Record<string, string> = {
  produce: 'Produce',
  bakery: 'Bakery',
  prepared_meals: 'Prepared meals',
  dairy_eggs: 'Dairy & eggs',
  meat_seafood: 'Meat & seafood',
  pantry: 'Pantry',
  snacks: 'Snacks',
  beverages: 'Beverages',
  baby_kids: 'Baby & kids',
  frozen: 'Frozen',
  other: 'Other',
};

export const DIETARY_TAGS = ['vegetarian', 'vegan', 'halal', 'kosher', 'gluten_free', 'dairy_free', 'nut_free'];

export const TAG_LABELS: Record<string, string> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  halal: 'Halal',
  kosher: 'Kosher',
  gluten_free: 'Gluten-free',
  dairy_free: 'Dairy-free',
  nut_free: 'Nut-free',
  cold: 'Cold / ready to eat',
  warm: 'Warm / heat first',
  snack: 'Snack',
  small_meal: 'Small meal',
  large_meal: 'Large meal',
};

export const categoryLabel = (category: string) => CATEGORY_LABELS[category] ?? category;
export const tagLabel = (tag: string) => TAG_LABELS[tag] ?? tag.replace(/_/g, ' ');
