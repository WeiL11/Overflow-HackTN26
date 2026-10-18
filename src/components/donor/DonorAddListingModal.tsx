import type { FormEvent, RefObject } from "react";
import {
  Button,
  IconButton,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { MapPin, Plus, Check } from "lucide-react";
import AppModal, { ModalClose } from "@/components/AppModal";
import FoodPhotoUpload from "@/components/FoodPhotoUpload";
import WeeklySchedule from "@/components/WeeklySchedule";
import type { AvailabilityBlock } from "@/types/food";
import type { FoodPhotoSuggestion } from "@/types/food-photo";

type DonorListingDraft = {
  foodName: string;
  quantity: string;
  location: string;
  expiryTime: string;
  pickupBlocks: AvailabilityBlock[];
  notes: string;
};
type DonorAddListingModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  step: 1 | 2;
  onStepChange: (step: 1 | 2) => void;
  draft: DonorListingDraft;
  onDraftChange: (draft: DonorListingDraft) => void;
  formRef: RefObject<HTMLFormElement>;
  locationInputRef: RefObject<HTMLInputElement>;
  onSubmit: (event: FormEvent) => void;
  onNext: () => void;
  submitting: boolean;
  analyzing: boolean;
  sourcePhotoPath: string | null;
  locationSource: "gps" | "previous" | null;
  onConfirmLocation: () => void;
  onPhotoChange: (photo: File | null) => void;
  onBusyChange: (busy: boolean) => void;
  onSuggestion: (suggestion: FoodPhotoSuggestion | null) => void;
};

// Isolates the two-step listing form from donor dashboard data and mutation orchestration.
const DonorAddListingModal = ({
  open,
  onOpenChange,
  step,
  onStepChange,
  draft,
  onDraftChange,
  formRef,
  locationInputRef,
  onSubmit,
  onNext,
  submitting,
  analyzing,
  sourcePhotoPath,
  locationSource,
  onConfirmLocation,
  onPhotoChange,
  onBusyChange,
  onSuggestion,
}: DonorAddListingModalProps) => {
  const patch = (changes: Partial<DonorListingDraft>) =>
    onDraftChange({ ...draft, ...changes });
  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      maxWidth="1100px"
      title="New Food Listing"
      description="Share available food with recipients in your community."
      triggerTooltip="Add food"
      trigger={
        <IconButton
          size="3"
          className="fixed bottom-6 right-6 z-[100] rounded-full shadow-xl"
          aria-label="Add food"
        >
          <Plus className="h-5 w-5" />
        </IconButton>
      }
    >
      <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
        <p className="text-center text-sm font-medium text-muted-foreground">
          {step === 1
            ? "Step 1 of 2 · Food details"
            : "Step 2 of 2 · Pickup availability"}
        </p>
        {step === 1 && (
          <>
            <FoodPhotoUpload
              disabled={submitting}
              onPhotoChange={onPhotoChange}
              onBusyChange={onBusyChange}
              onSuggestion={onSuggestion}
            />
            {sourcePhotoPath && (
              <p className="text-xs text-muted-foreground">
                Existing photo will be copied. Upload a new photo to replace it.
              </p>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Text as="label" htmlFor="foodName">
                  Food Name
                </Text>
                <TextField.Root
                  id="foodName"
                  value={draft.foodName}
                  onChange={(event) => patch({ foodName: event.target.value })}
                  required
                />
              </div>
              <div>
                <Text as="label" htmlFor="quantity">
                  Quantity
                </Text>
                <TextField.Root
                  id="quantity"
                  type="number"
                  min="1"
                  step="1"
                  value={draft.quantity}
                  onChange={(event) => patch({ quantity: event.target.value })}
                  required
                />
              </div>
              <div>
                <Text as="label" htmlFor="location">
                  Pickup Location
                </Text>
                <TextField.Root
                  id="location"
                  ref={locationInputRef}
                  value={draft.location}
                  onChange={(event) => patch({ location: event.target.value })}
                  required
                />
                {locationSource && (
                  <div className="mt-2 flex items-center justify-between rounded-md bg-amber-50 p-2 text-xs">
                    <span>
                      <MapPin className="mr-1 inline h-3.5 w-3.5" />
                      {locationSource === "gps"
                        ? "Filled from your current location."
                        : "Filled from your last donation."}{" "}
                      Is this right?
                    </span>
                    <Button
                      type="button"
                      size="1"
                      variant="soft"
                      color="amber"
                      onClick={onConfirmLocation}
                    >
                      <Check className="h-3.5 w-3.5" /> Confirm
                    </Button>
                  </div>
                )}
              </div>
              <div>
                <Text as="label" htmlFor="expiryTime">
                  Food expiration
                </Text>
                <TextField.Root
                  id="expiryTime"
                  type="datetime-local"
                  value={draft.expiryTime}
                  onChange={(event) =>
                    patch({ expiryTime: event.target.value })
                  }
                  required
                />
              </div>
            </div>
            <Text as="label" size="1">
              AI suggestions are reviewed before posting.
            </Text>
            <div>
              <Text as="label" htmlFor="listingNotes">
                Notes (optional)
              </Text>
              <TextArea
                id="listingNotes"
                className="resize-y"
                maxLength={1000}
                value={draft.notes}
                onChange={(event) => patch({ notes: event.target.value })}
              />
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <h3 className="text-lg font-heading font-semibold">
              Pickup availability
            </h3>
            <p className="text-sm text-muted-foreground">
              Select one or more future pickup windows.
            </p>
            <WeeklySchedule
              blocks={draft.pickupBlocks}
              onChange={(pickupBlocks) => patch({ pickupBlocks })}
              maxDateTime={draft.expiryTime || undefined}
            />
          </>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <ModalClose>
            <Button
              type="button"
              variant="outline"
              color="gray"
              disabled={submitting || analyzing}
            >
              Cancel
            </Button>
          </ModalClose>
          {step === 1 ? (
            <Button
              type="button"
              disabled={submitting || analyzing}
              onClick={onNext}
            >
              Next
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                color="gray"
                disabled={submitting || analyzing}
                onClick={() => onStepChange(1)}
              >
                Back
              </Button>
              <Button type="submit" disabled={submitting || analyzing}>
                {submitting ? "Adding..." : "Add"}
              </Button>
            </>
          )}
        </div>
      </form>
    </AppModal>
  );
};
export type { DonorListingDraft };
export default DonorAddListingModal;
