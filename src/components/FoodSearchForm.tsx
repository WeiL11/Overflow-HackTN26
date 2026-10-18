import { IconButton, TextField, Tooltip } from "@radix-ui/themes";
import { Search, X } from "lucide-react";

type FoodSearchFormProps = {
  id: string;
  value: string;
  resultCount: number;
  appliedValue?: string;
  showResultCount?: boolean;
  placeholder?: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
};

const FoodSearchForm = ({
  id,
  value,
  resultCount,
  appliedValue,
  showResultCount = true,
  placeholder = "Search by food name or location...",
  onValueChange,
  onSubmit,
  onClear,
}: FoodSearchFormProps) => (
  <form
    className="space-y-3"
    onSubmit={(event) => {
      event.preventDefault();
      onSubmit();
    }}
  >
    <div className="flex items-stretch gap-2">
      <TextField.Root
        id={id}
        className="min-w-0 flex-1"
        size="3"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      >
        <TextField.Slot>
          <Search className="h-4 w-4 text-muted-foreground" />
        </TextField.Slot>
        {value && (
          <TextField.Slot side="right">
            <Tooltip content="Clear search">
              <IconButton
                type="button"
                size="1"
                variant="ghost"
                color="gray"
                className="!bg-transparent hover:!bg-gray-500/10"
                aria-label="Clear search"
                onClick={onClear}
              >
                <X className="h-3.5 w-3.5" />
              </IconButton>
            </Tooltip>
          </TextField.Slot>
        )}
      </TextField.Root>
      <Tooltip content="Search">
        <IconButton type="submit" size="3" className="shrink-0" aria-label="Search">
          <Search className="h-4 w-4" />
        </IconButton>
      </Tooltip>
    </div>
    {showResultCount && (
      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          {resultCount} {resultCount === 1 ? 'listing' : 'listings'} found
          {appliedValue ? ` for “${appliedValue}”` : ''}
        </p>
      </div>
    )}
  </form>
);

export default FoodSearchForm;
