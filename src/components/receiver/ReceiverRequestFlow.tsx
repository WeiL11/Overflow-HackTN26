import AppModal from "@/components/AppModal";
import WeeklySchedule from "@/components/WeeklySchedule";
import { Button, Text, TextArea, TextField } from "@radix-ui/themes";
import { formatPickupWindow } from "@/lib/pickupSlots";
import type { FoodListing, PickupSlotAvailability } from "@/types/food";

type ReceiverRequestFlowProps = {
  requestListing: FoodListing | undefined;
  confirmationListing: FoodListing | undefined;
  availableSlots: PickupSlotAvailability[];
  selectedSlotId: string;
  quantity: string;
  notes: string;
  requesting: boolean;
  onSelectedSlotChange: (id: string) => void;
  onQuantityChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onClose: () => void;
  onReview: () => void;
  onBackToEdit: () => void;
  onConfirm: () => void;
};

// Isolates the two-step request and confirmation UI from receiver dashboard data and mutations.
const ReceiverRequestFlow = ({
  requestListing,
  confirmationListing,
  availableSlots,
  selectedSlotId,
  quantity,
  notes,
  requesting,
  onSelectedSlotChange,
  onQuantityChange,
  onNotesChange,
  onClose,
  onReview,
  onBackToEdit,
  onConfirm,
}: ReceiverRequestFlowProps) => {
  const selectedSlot = availableSlots.find(
    (slot) => slot.id === selectedSlotId,
  );
  return (
    <>
      <AppModal
        open={Boolean(requestListing)}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        maxWidth="1100px"
        title="Request food"
        description="Choose a quantity and one available 15-minute pickup time."
        trigger={<span />}
      >
        {requestListing && (
          <div className="space-y-4">
            <div className="flex">
              <div className="flex flex-col w-full">
                <div className="font-medium text-foreground w-full">
                  {requestListing.food_name}
                </div>
                <div className="text-sm text-muted-foreground">
                  {requestListing.location}
                </div>
              </div>
              <div className="flex w-full gap-2 justify-end items-center">
                <div className="flex flex-col">
                  <Text
                    className="flex items-center justify-center"
                    as="label"
                    size="1"
                    weight="bold"
                    htmlFor="request-quantity-modal"
                  >
                    Quantity (items)
                  </Text>
                  <Text className="ml-auto" size="1">
                    {requestListing.quantity} available
                  </Text>
                </div>
                <TextField.Root
                  className="w-[300px]"
                  id="request-quantity-modal"
                  type="number"
                  min="1"
                  max={requestListing.quantity}
                  step="1"
                  value={quantity}
                  onChange={(event) => onQuantityChange(event.target.value)}
                  disabled={requesting}
                />
              </div>
            </div>
            <WeeklySchedule
              mode="select"
              slots={availableSlots}
              selectedSlotId={selectedSlotId}
              onSelect={onSelectedSlotChange}
              disabled={requesting}
            />
            <div className="rounded-md bg-primary/10 p-3 text-sm font-medium text-foreground">
              {selectedSlot
                ? `Selected Pickup: ${formatPickupWindow(selectedSlot)}`
                : "Select one 15-minute pickup slot"}
            </div>
            <div className="space-y-2">
              <Text
                as="label"
                size="2"
                weight="medium"
                htmlFor="request-notes-modal"
              >
                Notes (optional)
              </Text>
              <TextArea
                id="request-notes-modal"
                className="resize-y"
                maxLength={1000}
                placeholder="Add a note for the donor..."
                value={notes}
                onChange={(event) => onNotesChange(event.target.value)}
                disabled={requesting}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                color="gray"
                disabled={requesting}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={requesting || availableSlots.length === 0}
                onClick={onReview}
              >
                Submit
              </Button>
            </div>
          </div>
        )}
      </AppModal>
      <AppModal
        open={Boolean(confirmationListing)}
        onOpenChange={(open) => {
          if (!open) onBackToEdit();
        }}
        title="Confirm food request"
        description="Review your quantity, pickup window, and notes before submitting."
        trigger={<span />}
      >
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Item:</span>{" "}
            {confirmationListing?.food_name}
          </p>
          <p>
            <span className="font-medium text-foreground">Quantity:</span>{" "}
            {quantity}
          </p>
          {selectedSlot && (
            <p>
              <span className="font-medium text-foreground">Pickup:</span>{" "}
              {formatPickupWindow(selectedSlot)}
            </p>
          )}
          {notes.trim() && (
            <p>
              <span className="font-medium text-foreground">Notes:</span>{" "}
              {notes.trim()}
            </p>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            color="gray"
            onClick={onBackToEdit}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={requesting || !confirmationListing}
            onClick={onConfirm}
          >
            Confirm Request
          </Button>
        </div>
      </AppModal>
    </>
  );
};
export default ReceiverRequestFlow;
