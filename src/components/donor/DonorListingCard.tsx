import { Card, IconButton, Tooltip, type BadgeProps } from "@radix-ui/themes";
import {
  ArrowLeft,
  Check,
  CheckCircle,
  Undo2,
  User,
  XCircle,
} from "lucide-react";
import ListingPhoto from "@/components/ListingPhoto";
import ExpiryCountdown from "@/components/ExpiryCountdown";
import ListingTimeline from "@/components/ListingTimeline";
import DonorListingActions from "@/components/donor/DonorListingActions";
import { formatPickupRange, formatPickupWindow } from "@/lib/pickupSlots";
import { formatCount } from "@/lib/plural";
import { requestTimelineStage } from "@/lib/listingStatus";
import type {
  FoodListing,
  FoodRequestWithPickupAllocations,
  PickupSlotSummary,
  ProfileSummary,
} from "@/types/food";

type DonorListingCardProps = {
  listing: FoodListing;
  requests: FoodRequestWithPickupAllocations[];
  receiverProfiles: Map<string, ProfileSummary>;
  pickupSlots: PickupSlotSummary[];
  displayStatus: string;
  onEdit: (listing: FoodListing) => void;
  onManage: (listing: FoodListing) => void;
  onDuplicate: (listing: FoodListing) => void;
  onDelete: (id: string) => void;
  onAccept: (id: string) => void;
  onBack: (id: string) => void;
  onDecline: (id: string) => void;
  onDone: (id: string) => void;
  onUndo: (id: string) => void;
};

const statusColor = (status: string): Pick<BadgeProps, "color" | "variant"> => {
  if (status === "available") return { color: "green", variant: "solid" };
  if (status === "completed") return { color: "green", variant: "solid" };
  if (status === "expired") return { color: "gray", variant: "outline" };
  return { color: "gray", variant: "soft" };
};

// Encapsulates one listing and each receiver's independent lifecycle to reduce merge conflicts in the dashboard.
const DonorListingCard = ({
  listing,
  requests,
  receiverProfiles,
  pickupSlots,
  displayStatus,
  onEdit,
  onManage,
  onDuplicate,
  onDelete,
  onAccept,
  onBack,
  onDecline,
  onDone,
  onUndo,
}: DonorListingCardProps) => {
  const pendingRequests = requests.filter(
    (request) => request.status === "pending",
  );
  return (
    <Card className="card-shadow hover:card-shadow-hover transition-shadow">
      <div className="p-5">
        <div className="flex flex-col items-start gap-2 sm:flex-row">
          <ListingPhoto
            path={listing.photo_path}
            analysis={listing.food_analysis}
            name={listing.food_name}
          />
          <div className="flex min-w-0 flex-1 items-start justify-between">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-foreground">
                  {listing.food_name}
                </h3>
                <DonorListingActions
                  listing={listing}
                  onEdit={onEdit}
                  onManage={onManage}
                  onDuplicate={onDuplicate}
                  onDelete={onDelete}
                />
              </div>
              <div className="flex">
                <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    {listing.quantity} /{" "}
                    {formatCount(listing.original_quantity, "item")}
                  </span>
                  <ExpiryCountdown expiryTime={listing.expiry_time} />
                  <span>{listing.location}</span>
                </div>
                {pickupSlots.length > 0 && (
                  <div className="ml-auto mt-3 text-xs text-muted-foreground">
                    <span className="rounded-full bg-muted px-2.5 py-1">
                      Pickup availability: {formatPickupRange(pickupSlots)}
                    </span>
                  </div>
                )}
              </div>
              {listing.notes && (
                <p className="mt-3 text-sm text-muted-foreground">
                  {listing.notes}
                </p>
              )}
            </div>
          </div>
        </div>
        {requests.length > 0 && (
          <div className="mt-4 space-y-2 border-t pt-4">
            <p className="text-sm font-medium">
              Requests ({pendingRequests.length} pending)
            </p>
            {requests.map((request) => {
              const profile = receiverProfiles.get(request.receiver_id);
              return (
                <div
                  key={request.id}
                  className="rounded-lg border bg-muted/20 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <div className="flex flex-col">
                        <span className="text-muted-foreground">
                          {profile?.full_name ||
                            `Receiver ${request.receiver_id.slice(0, 8)}...`}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Requested: {formatCount(request.quantity, "item")}
                        </span>
                        {request.allocations.map(
                          (allocation) =>
                            allocation.pickup_slot && (
                              <span
                                key={allocation.pickup_slot.starts_at}
                                className="text-xs text-muted-foreground"
                              >
                                Pickup:{" "}
                                {formatPickupWindow(allocation.pickup_slot)} (
                                {formatCount(allocation.quantity, "item")})
                              </span>
                            ),
                        )}
                        {request.notes && (
                          <span className="text-xs italic text-muted-foreground">
                            “{request.notes}”
                          </span>
                        )}
                        {request.status_note && (
                          <span className="text-xs text-muted-foreground">
                            Update note: {request.status_note}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {request.status === "pending" && (
                        <>
                          <Tooltip content="Decline">
                            <IconButton
                              size="1"
                              variant="ghost"
                              className="!bg-transparent text-destructive hover:!bg-red-500/10"
                              onClick={() => onDecline(request.id)}
                              aria-label="Decline"
                            >
                              <XCircle className="h-4 w-4" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip content="Accept and move to pending pickup">
                            <IconButton
                              size="1"
                              variant="ghost"
                              className="!bg-transparent text-primary hover:!bg-primary/10"
                              onClick={() => onAccept(request.id)}
                              aria-label="Accept and move to pending pickup"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                      {request.status === "pending_pickup" && (
                        <>
                          <Tooltip content="Back to requested">
                            <IconButton
                              size="1"
                              variant="ghost"
                              color="gray"
                              className="!bg-transparent text-gray-600 hover:!bg-gray-500/10"
                              onClick={() => onBack(request.id)}
                              aria-label="Back to requested"
                            >
                              <ArrowLeft className="h-4 w-4" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip content="Mark as Complete">
                            <IconButton
                              size="1"
                              variant="ghost"
                              className="!bg-transparent text-primary hover:!bg-primary/10"
                              onClick={() => onDone(request.id)}
                              aria-label="Done"
                            >
                              <Check className="h-4 w-4" />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                      {request.status === "completed" && (
                        <Tooltip content="Back to pending pickup">
                          <IconButton
                            size="1"
                            variant="ghost"
                            color="gray"
                            className="!bg-transparent text-gray-600 hover:!bg-gray-500/10"
                            onClick={() => onBack(request.id)}
                            aria-label="Back to pending pickup"
                          >
                            <ArrowLeft className="h-4 w-4" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {request.status === "declined" && (
                        <Tooltip content="Undo decline">
                          <IconButton
                            size="1"
                            variant="ghost"
                            className="!bg-transparent text-gray-600 hover:!bg-gray-500/10"
                            onClick={() => onUndo(request.id)}
                            aria-label="Undo decline"
                          >
                            <Undo2 className="h-4 w-4" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                  <ListingTimeline
                    stage={requestTimelineStage(request.status)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
};
export default DonorListingCard;
