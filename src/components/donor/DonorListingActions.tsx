import { IconButton, Tooltip } from '@radix-ui/themes';
import { CalendarCog, Copy, Pencil, Trash2 } from 'lucide-react';
import type { FoodListing } from '@/types/listing';

type DonorListingActionsProps = {
  listing: FoodListing;
  onEdit: (listing: FoodListing) => void;
  onManage: (listing: FoodListing) => void;
  onDuplicate: (listing: FoodListing) => void;
  onDelete: (id: string) => void;
};

// Keeps listing-level management controls separate from receiver lifecycle actions.
const DonorListingActions = ({ listing, onEdit, onManage, onDuplicate, onDelete }: DonorListingActionsProps) => (
  <div className="ml-auto flex shrink-0 items-center gap-1">
    <Tooltip content="Edit listing">
      <IconButton
        variant="ghost"
        size="1"
        className="!bg-transparent text-gray-600 hover:!bg-gray-500/10"
        onClick={() => onEdit(listing)}
        aria-label="Edit listing"
      >
        <Pencil className="h-4 w-4" />
      </IconButton>
    </Tooltip>
    <Tooltip content="Manage pickup slots">
      <IconButton
        variant="ghost"
        size="1"
        className="!bg-transparent text-gray-600 hover:!bg-gray-500/10"
        onClick={() => onManage(listing)}
        aria-label="Manage pickup slots"
      >
        <CalendarCog className="h-4 w-4" />
      </IconButton>
    </Tooltip>
    <Tooltip content="Duplicate listing">
      <IconButton
        variant="ghost"
        size="1"
        className="!bg-transparent text-gray-600 hover:!bg-gray-500/10"
        onClick={() => onDuplicate(listing)}
        aria-label="Duplicate listing"
      >
        <Copy className="h-4 w-4" />
      </IconButton>
    </Tooltip>
    <Tooltip content="Delete listing">
      <IconButton
        variant="ghost"
        size="1"
        color="red"
        className="!bg-transparent text-destructive hover:!bg-red-500/10"
        onClick={() => onDelete(listing.id)}
        aria-label="Delete listing"
      >
        <Trash2 className="h-4 w-4" />
      </IconButton>
    </Tooltip>
  </div>
);

export default DonorListingActions;
