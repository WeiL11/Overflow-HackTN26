import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import AppModal from "@/components/AppModal";
import FoodSearchForm from "@/components/FoodSearchForm";
import ReceiverListingCard from "@/components/receiver/ReceiverListingCard";
import ReceiverRequestFlow from "@/components/receiver/ReceiverRequestFlow";
import RequestReasonModal from "@/components/RequestReasonModal";
import type {
  FoodListing,
  PickupSlotAvailability,
  RequestAction,
  RequestByListing,
  RecipientListingFilter,
} from "@/types/food";
import {
  cancelFoodRequest,
  confirmFoodPickup,
  getAvailablePickupSlots,
  getRecipientDashboardData,
  reserveFood,
} from "@/services/food";
import { Badge, IconButton, SegmentedControl } from "@radix-ui/themes";
import { toast } from "react-toastify";
import { formatCount } from "@/lib/plural";
import { usePolling } from "@/hooks/usePolling";
import { DASHBOARD_POLL_INTERVAL_MS } from "@/config/timing";
import { Package, Search } from "lucide-react";

const ReceiverDashboard = () => {
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [listings, setListings] = useState<FoodListing[]>([]);
  const [searchDraft, setSearchDraft] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<RecipientListingFilter>("active");
  const [selectedAction, setSelectedAction] = useState<{
    requestId: string;
    action: Extract<RequestAction, "confirm" | "cancel">;
  } | null>(null);
  const [myRequests, setMyRequests] = useState<RequestByListing>(new Map());
  const [requesting, setRequesting] = useState<string | null>(null);
  const [requestFormListingId, setRequestFormListingId] = useState<
    string | null
  >(null);
  const [confirmationListingId, setConfirmationListingId] = useState<
    string | null
  >(null);
  const [selectedPickupSlotId, setSelectedPickupSlotId] = useState("");
  const [availableSlots, setAvailableSlots] = useState<
    PickupSlotAvailability[]
  >([]);
  const [requestedQuantity, setRequestedQuantity] = useState("1");
  const [requestNotes, setRequestNotes] = useState("");

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  const receiverId = user?.id;

  const fetchDashboardData = useCallback(async () => {
    if (!receiverId) return;
    try {
      const { listings, requests } =
        await getRecipientDashboardData(receiverId);
      const map: RequestByListing = new Map();
      requests.forEach((request) => map.set(request.listing_id, request));
      setListings(listings);
      setMyRequests(map);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to load dashboard data.",
      );
    }
  }, [receiverId]);

  usePolling(
    fetchDashboardData,
    DASHBOARD_POLL_INTERVAL_MS,
    Boolean(user && receiverId),
  );

  useEffect(() => {
    if (user) fetchDashboardData();
  }, [fetchDashboardData, user]);

  useEffect(() => {
    if (!receiverId) return;
    const channel = supabase
      .channel(`receiver-dashboard-${receiverId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "food_listings" },
        fetchDashboardData,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pickup_slots" },
        fetchDashboardData,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "food_requests",
          filter: `receiver_id=eq.${receiverId}`,
        },
        fetchDashboardData,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "request_pickup_allocations" },
        fetchDashboardData,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchDashboardData, receiverId]);

  const openRequestForm = async (listingId: string) => {
    setRequestFormListingId(listingId);
    setSelectedPickupSlotId("");
    setAvailableSlots([]);
    setRequestedQuantity("1");
    setRequestNotes("");
    try {
      setAvailableSlots(await getAvailablePickupSlots(listingId));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to load pickup windows.",
      );
    }
  };

  const closeRequestForm = () => {
    setRequestFormListingId(null);
    setSelectedPickupSlotId("");
    setAvailableSlots([]);
    setRequestedQuantity("1");
    setRequestNotes("");
  };
  const returnToRequestForm = () => {
    setRequestFormListingId(confirmationListingId);
    setConfirmationListingId(null);
  };
  const reviewRequest = () => {
    if (!requestListing) return;
    const quantity = Number.parseInt(requestedQuantity, 10);
    if (
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      Number(requestedQuantity) !== quantity ||
      quantity > requestListing.quantity
    ) {
      toast.error("Enter a valid quantity.");
      return;
    }
    if (!selectedPickupSlotId) {
      toast.error("Select a pickup window.");
      return;
    }
    setConfirmationListingId(requestListing.id);
    setRequestFormListingId(null);
  };

  const handleRequest = async (listingId: string) => {
    if (!user) return;
    const listing = listings.find((item) => item.id === listingId);
    if (!listing) return;
    const quantity = Number.parseInt(requestedQuantity, 10);
    if (
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      Number(requestedQuantity) !== quantity
    ) {
      toast.error("Enter a positive whole-item quantity.");
      return;
    }
    if (quantity > listing.quantity) {
      toast.error(
        `Only ${formatCount(listing.quantity, "item")} ${listing.quantity === 1 ? "is" : "are"} available.`,
      );
      return;
    }
    if (!selectedPickupSlotId) {
      toast.error("Select a pickup window.");
      return;
    }

    setRequesting(listingId);
    try {
      await reserveFood({
        listingId,
        quantity,
        pickupSlotId: selectedPickupSlotId,
        notes: requestNotes.trim() || undefined,
      });
      toast.success("Food reserved! The donor will review your request.");
      setRequestFormListingId(null);
      setSelectedPickupSlotId("");
      setAvailableSlots([]);
      setRequestedQuantity("1");
      setRequestNotes("");
      fetchDashboardData();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to reserve food.",
      );
    } finally {
      setRequesting(null);
    }
  };

  const handleCancelRequest = async (requestId: string, note?: string) => {
    try {
      await cancelFoodRequest(requestId, note);
      toast.success("Request cancelled.");
      fetchDashboardData();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to cancel request.",
      );
      throw error;
    }
  };

  const handleConfirmPickup = async (requestId: string, note?: string) => {
    try {
      await confirmFoodPickup(requestId, note);
      toast.success("Pickup confirmed and request completed.");
      fetchDashboardData();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to confirm pickup.",
      );
      throw error;
    }
  };

  const applySearch = () => setAppliedSearch(searchDraft.trim());
  const clearSearch = () => {
    setSearchDraft("");
    setAppliedSearch("");
  };

  const normalizedSearch = appliedSearch.trim().toLowerCase();
  const filtered = listings.filter((listing) => {
    const requestStatus = myRequests.get(listing.id)?.status;
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" &&
        (!requestStatus ||
          requestStatus === "pending" ||
          requestStatus === "pending_pickup")) ||
      (statusFilter === "done" && requestStatus === "completed");
    const matchesSearch =
      listing.food_name.toLowerCase().includes(normalizedSearch) ||
      listing.location.toLowerCase().includes(normalizedSearch);
    return matchesStatus && matchesSearch;
  });

  const confirmationListing = listings.find(
    (listing) => listing.id === confirmationListingId,
  );
  const requestListing = listings.find(
    (listing) => listing.id === requestFormListingId,
  );
  const selectedSlot = availableSlots.find(
    (slot) => slot.id === selectedPickupSlotId,
  );
  const recipientName = profile?.full_name?.split(" ")[0] || "there";

  if (authLoading) return null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Navbar />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="container mx-auto max-w-4xl px-4 py-10">
          <section className="mb-8 rounded-2xl border border-primary/15 bg-secondary p-6 md:p-8">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-3xl font-heading font-bold text-foreground">
                Hi, {recipientName}
              </h1>
              <Badge color="gray" variant="solid">
                Recipient Dashboard
              </Badge>
            </div>
            <p className="mt-1 text-muted-foreground">
              Find fresh food available in your community.
            </p>
          </section>

          <div className="mb-4 flex justify-end">
            <SegmentedControl.Root
              value={statusFilter}
              onValueChange={(value) =>
                setStatusFilter(value as RecipientListingFilter)
              }
            >
              <SegmentedControl.Item value="active">
                Active
              </SegmentedControl.Item>
              <SegmentedControl.Item value="all">All</SegmentedControl.Item>
              <SegmentedControl.Item value="done">Done</SegmentedControl.Item>
            </SegmentedControl.Root>
          </div>
          <div className="mb-4">
            <FoodSearchForm
              id="recipient-search"
              value={searchDraft}
              appliedValue={appliedSearch}
              resultCount={filtered.length}
              onValueChange={setSearchDraft}
              onSubmit={applySearch}
              onClear={clearSearch}
            />
          </div>
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p>
                {appliedSearch
                  ? "No food matches your search."
                  : "No food available right now. Check back soon!"}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filtered.map((item) => {
                const request = myRequests.get(item.id);
                return (
                  <ReceiverListingCard
                    key={item.id}
                    listing={item}
                    request={request}
                    requesting={requesting === item.id}
                    onRequest={openRequestForm}
                    onCancel={(requestId) =>
                      setSelectedAction({ requestId, action: "cancel" })
                    }
                    onConfirm={(requestId) =>
                      setSelectedAction({ requestId, action: "confirm" })
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      </main>
      <AppModal
        open={searchOpen}
        onOpenChange={(open) => {
          if (open) setSearchDraft(appliedSearch);
          setSearchOpen(open);
        }}
        title="Search available food"
        triggerTooltip="Search food"
        trigger={
          <IconButton
            size="3"
            className="fixed bottom-6 right-6 z-[100] rounded-full shadow-xl"
            aria-label="Search food"
          >
            <Search className="h-5 w-5" />
          </IconButton>
        }
      >
        <FoodSearchForm
          id="recipient-search-modal"
          value={searchDraft}
          appliedValue={appliedSearch}
          resultCount={filtered.length}
          showResultCount={false}
          placeholder="Filter listings by food name or pickup location..."
          onValueChange={setSearchDraft}
          onSubmit={() => {
            applySearch();
            setSearchOpen(false);
          }}
          onClear={clearSearch}
        />
      </AppModal>
      <ReceiverRequestFlow
        requestListing={requestListing}
        confirmationListing={confirmationListing}
        availableSlots={availableSlots}
        selectedSlotId={selectedPickupSlotId}
        quantity={requestedQuantity}
        notes={requestNotes}
        requesting={Boolean(requesting)}
        onSelectedSlotChange={setSelectedPickupSlotId}
        onQuantityChange={setRequestedQuantity}
        onNotesChange={setRequestNotes}
        onClose={closeRequestForm}
        onReview={reviewRequest}
        onBackToEdit={returnToRequestForm}
        onConfirm={() => {
          if (confirmationListingId) {
            void handleRequest(confirmationListingId);
            setConfirmationListingId(null);
          }
        }}
      />
      {selectedAction && (
        <RequestReasonModal
          open
          action={selectedAction.action}
          onOpenChange={(open) => {
            if (!open) setSelectedAction(null);
          }}
          onSubmit={(note) =>
            selectedAction.action === "confirm"
              ? handleConfirmPickup(selectedAction.requestId, note)
              : handleCancelRequest(selectedAction.requestId, note)
          }
        />
      )}
    </div>
  );
};

export default ReceiverDashboard;
