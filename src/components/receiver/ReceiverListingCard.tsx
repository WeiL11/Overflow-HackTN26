import { Badge, Button, Card, IconButton, Tooltip } from "@radix-ui/themes";
import { CheckCircle, MapPin, Package, Undo2 } from "lucide-react";
import ListingPhoto from "@/components/ListingPhoto";
import ExpiryCountdown from "@/components/ExpiryCountdown";
import ListingTimeline from "@/components/ListingTimeline";
import { formatPickupWindow } from "@/lib/pickupSlots";
import { formatCount } from "@/lib/plural";
import { requestTimelineStage } from "@/lib/listingStatus";
import type { FoodListing, RecipientRequest } from "@/types/food";

type ReceiverListingCardProps = {
  listing: FoodListing;
  request: RecipientRequest | undefined;
  requesting: boolean;
  onRequest: (id: string) => void;
  onCancel: (id: string) => void;
  onConfirm: (id: string) => void;
};

// Keeps one listing and the receiver's lifecycle presentation isolated from dashboard data orchestration.
const ReceiverListingCard = ({
  listing,
  request,
  requesting,
  onRequest,
  onCancel,
  onConfirm,
}: ReceiverListingCardProps) => {
  const status = request?.status;
  const hasRequested =
    !!request && status !== "declined" && status !== "cancelled";
  return (
    <Card className="card-shadow hover:card-shadow-hover transition-shadow">
      <div className="p-5">
        <div className="flex flex-col items-start gap-4 sm:flex-row">
          <ListingPhoto
            path={listing.photo_path}
            analysis={listing.food_analysis}
            name={listing.food_name}
          />
          <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <h3 className="text-lg font-semibold text-foreground">
                {listing.food_name}
              </h3>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Package className="h-3.5 w-3.5" />
                  {formatCount(listing.quantity, "item")}
                </span>
                <ExpiryCountdown expiryTime={listing.expiry_time} />
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {listing.location}
                </span>
              </div>
              {listing.notes && (
                <p className="mt-3 text-sm text-muted-foreground">
                  {listing.notes}
                </p>
              )}
            </div>
            <div className="shrink-0">
              {request?.status_note && (
                <p className="mb-2 max-w-48 text-right text-xs text-muted-foreground">
                  Update note: {request.status_note}
                </p>
              )}

              {hasRequested ? (
                <div className="flex flex-col items-end gap-2">
                  {status === "pending" && (
                    <>
                      <Tooltip content="Undo request">
                        <IconButton
                          type="button"
                          size="2"
                          variant="ghost"
                          color="gray"
                          className="!bg-transparent hover:!bg-gray-500/10"
                          disabled={requesting}
                          aria-label="Undo request"
                          onClick={() => onCancel(request!.id)}
                        >
                          <Undo2 className="h-4 w-4" />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                  {status === "pending_pickup" && (
                    <div className="flex gap-2">
                      <Tooltip content="Undo request">
                        <IconButton
                          type="button"
                          size="2"
                          variant="ghost"
                          color="gray"
                          className="!bg-transparent hover:!bg-gray-500/10"
                          disabled={requesting}
                          aria-label="Undo request"
                          onClick={() => onCancel(request!.id)}
                        >
                          <Undo2 className="h-4 w-4" />
                        </IconButton>
                      </Tooltip>
                      {request?.pickup_confirmed_at ? (
                        <Badge
                          color="green"
                          variant="soft"
                          className="flex items-center gap-1"
                        >
                          <CheckCircle className="h-3 w-3" /> Pickup confirmed
                        </Badge>
                      ) : (
                        <Tooltip content="Confirm pickup">
                          <IconButton
                            type="button"
                            size="2"
                            variant="ghost"
                            color="green"
                            className="!bg-transparent hover:!bg-green-500/10"
                            disabled={requesting}
                            aria-label="Confirm pickup"
                            onClick={() => onConfirm(request!.id)}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </div>
                  )}
                  {status === "completed" && (
                    <Badge color="green" variant="solid">
                      Done
                    </Badge>
                  )}
                  {request?.allocations.map(
                    (allocation) =>
                      allocation.pickup_slot && (
                        <div
                          key={allocation.pickup_slot.starts_at}
                          className="mb-2 max-full text-right text-xs text-muted-foreground"
                        >
                          Pickup: {formatPickupWindow(allocation.pickup_slot)} (
                          {formatCount(allocation.quantity, "item")})
                        </div>
                      ),
                  )}
                </div>
              ) : (
                <div className="flex justify-end">
                  <Tooltip content="Request food">
                    <Button
                      size="2"
                      disabled={requesting}
                      onClick={() => onRequest(listing.id)}
                    >
                      Request
                    </Button>
                  </Tooltip>
                </div>
              )}
            </div>
          </div>
        </div>
        <ListingTimeline stage={requestTimelineStage(status || "available")} />
      </div>
    </Card>
  );
};
export default ReceiverListingCard;
