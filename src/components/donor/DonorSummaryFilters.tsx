import { Badge, Card, IconButton, Tooltip } from "@radix-ui/themes";
import { X } from "lucide-react";
import type { DonorListingFilter } from "@/types/food";

type DonorSummaryFiltersProps = {
  listingFilter: DonorListingFilter;
  pendingListings: number;
  availableListings: number;
  doneListings: number;
  totalListings: number;
  onFilterChange: (filter: DonorListingFilter) => void;
};
// Keeps donor summary filtering isolated from listing and request workflows.
const DonorSummaryFilters = ({
  listingFilter,
  pendingListings,
  availableListings,
  doneListings,
  onFilterChange,
}: DonorSummaryFiltersProps) => {
  const filters = [
    [
      "pending",
      "Click to show pending listings",
      "Pending orders",
      pendingListings,
      "border-l-amber-500",
    ],
    [
      "available",
      "Click to show available listings",
      "Available orders",
      availableListings,
      "border-l-primary",
    ],
    [
      "done",
      "Click to show completed orders",
      "Done orders",
      doneListings,
      "border-l-emerald-500",
    ],
  ] as const;
  return (
    <>
      <section
        className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3"
        aria-label="Donation summary"
      >
        {filters.map(([filter, tooltip, label, count, border]) => (
          <Tooltip key={filter} content={tooltip}>
            <button
              type="button"
              className="w-full cursor-pointer text-left"
              onClick={() => onFilterChange(filter)}
            >
              <Card
                className={`border-l-4 ${border} p-5 ${listingFilter === filter ? "ring-2 ring-primary ring-offset-2" : ""}`}
              >
                <p className="text-sm font-medium text-muted-foreground">
                  {label}
                </p>
                <p className="mt-2 text-3xl font-bold text-foreground">
                  {count}
                </p>
              </Card>
            </button>
          </Tooltip>
        ))}
      </section>
      {listingFilter !== "pending" && (
        <div className="mb-4 flex items-center">
          <Badge
            color="green"
            variant="soft"
            className="flex items-center gap-1"
          >
            {listingFilter === "available" ? "Available orders" : "Done orders"}
            <Tooltip content="Clear filter">
              <IconButton
                type="button"
                size="1"
                variant="ghost"
                className="!bg-transparent"
                aria-label="Clear filter"
                onClick={() => onFilterChange("pending")}
              >
                <X className="h-3 w-3" />
              </IconButton>
            </Tooltip>
          </Badge>
        </div>
      )}
    </>
  );
};
export default DonorSummaryFilters;
