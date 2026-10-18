import { useState } from "react";
import { Badge, Button, TextArea } from "@radix-ui/themes";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "react-toastify";
import { categoryLabel, tagLabel } from "@/config/foodTaxonomy";
import { errorMessage } from "@/lib/errors";
import { searchFoodWithAI, type FoodSearchResult } from "@/lib/foodSearch";
import { formatMiles, type LatLng } from "@/lib/geo";

export type AppliedAIResult = FoodSearchResult & { query: string };

const EXAMPLES = [
  "Vegetarian dinner for a family of 4",
  "Halal food, no nuts",
  "Snacks within half a mile",
  "Something I can eat without cooking",
];

type AskAIFoodSearchProps = {
  near: LatLng;
  // Number of the AI's picks that are in the receiver's current list.
  countMatches: (result: FoodSearchResult) => number;
  onApply: (result: AppliedAIResult) => void;
  // The AI service failed: fall back to a keyword search for the same text.
  onFallbackToKeyword: (query: string) => void;
};

// "Ask AI" tab of the Search Food window: describe a need in plain language and the
// OCI-hosted model ranks matching listings (server/searchFood.mjs enforces diet and distance).
const AskAIFoodSearch = ({ near, countMatches, onApply, onFallbackToKeyword }: AskAIFoodSearchProps) => {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<AppliedAIResult | null>(null);

  const run = async (text = query) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setSearching(true);
    try {
      const found = await searchFoodWithAI(trimmed, near);
      setResult({ ...found, query: trimmed });
      if (found.fallback) toast.info("AI is busy, so these are keyword matches.");
    } catch (error) {
      toast.error(errorMessage(error, "AI search is unavailable right now."));
      onFallbackToKeyword(trimmed);
    } finally {
      setSearching(false);
    }
  };

  const matches = result ? countMatches(result) : 0;
  const filters = result?.filters;

  return (
    <div className="space-y-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          run();
        }}
        className="space-y-3"
      >
        <TextArea
          autoFocus
          size="3"
          maxLength={300}
          placeholder="e.g. Dinner for 5 people, halal, one of us has a nut allergy"
          value={query}
          disabled={searching}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              run();
            }
          }}
        />
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <Button key={example} type="button" size="1" variant="soft" color="gray" disabled={searching} onClick={() => run(example)}>
              {example}
            </Button>
          ))}
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={searching || !query.trim()}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {searching ? "Searching..." : "Search with AI"}
          </Button>
        </div>
      </form>

      {result && !searching && (
        <div className="space-y-3 rounded-lg border border-primary/20 bg-muted/30 p-4">
          {result.summary && <p className="text-sm text-foreground">{result.summary}</p>}
          {filters && (
            <div className="flex flex-wrap gap-1.5">
              {filters.categories.map((category) => (
                <Badge key={category} size="1" variant="soft">{categoryLabel(category)}</Badge>
              ))}
              {filters.mustHaveTags.map((tag) => (
                <Badge key={tag} size="1" variant="soft" color="green">{tagLabel(tag)}</Badge>
              ))}
              {filters.avoidTags.map((tag) => (
                <Badge key={tag} size="1" variant="soft" color="red">No {tagLabel(tag).toLowerCase()}</Badge>
              ))}
              {filters.maxMiles != null && (
                <Badge size="1" variant="soft" color="blue">Within {formatMiles(filters.maxMiles)}</Badge>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="whitespace-nowrap text-sm text-muted-foreground">
              {matches} {matches === 1 ? "match" : "matches"} found
            </p>
            <Button type="button" disabled={matches === 0} onClick={() => onApply(result)}>
              View Results
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AskAIFoodSearch;
