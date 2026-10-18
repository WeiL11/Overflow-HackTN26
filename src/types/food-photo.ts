export interface FoodAnalysis {
  contains_food: boolean;
  food_name: string;
  description: string;
  visible_items: string[];
}

export interface FoodPhotoSuggestion {
  isFood: boolean;
  foodName: string;
  quantity: number | null;
  shelfLifeHours: number | null;
  description: string;
  model: string;
  keywords?: string[];
  llm_query?: {
    schema_version: number;
    task: string;
    messages: Array<{ role: string; content: string }>;
  } | null;
}
