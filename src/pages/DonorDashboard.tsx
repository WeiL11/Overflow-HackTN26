import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import FoodPhotoUpload from "@/components/FoodPhotoUpload";
import type { Json } from "@/integrations/supabase/types";
import { toDatetimeLocal } from "@/lib/foodPhoto";
import { FEATHERINGILL, FEATHERINGILL_ADDRESS, geocodeAddress } from "@/lib/geo";

// The Add Food form starts with Featheringill Hall and a deadline two hours from now.
const DEFAULT_EXPIRY_MS = 2 * 60 * 60 * 1000;
const defaultExpiryTime = () => toDatetimeLocal(new Date(Date.now() + DEFAULT_EXPIRY_MS));
import {
  canonicalPickupTimestamp,
  expandAvailabilityBlocks,
  getDuplicatedPickupBlocks,
  validatePickupBlocks,
} from "@/lib/pickupSlots";
import WeeklySchedule from "@/components/WeeklySchedule";
import { getListingDisplayStatus } from "@/lib/listingStatus";
import { formatCount } from "@/lib/plural";
import { getErrorMessage } from "@/lib/errors";
import { usePolling } from "@/hooks/usePolling";
import { DASHBOARD_POLL_INTERVAL_MS } from "@/config/timing";
import DonorSummaryFilters from "@/components/donor/DonorSummaryFilters";
import DonorListingCard from "@/components/donor/DonorListingCard";
import DonorAddListingModal from "@/components/donor/DonorAddListingModal";
import DonorManageScheduleModal from "@/components/donor/DonorManageScheduleModal";
import DonorEditListingModal from "@/components/donor/DonorEditListingModal";
import Navbar from "@/components/Navbar";
import AppModal, { ModalClose } from "@/components/AppModal";
import RequestReasonModal from "@/components/RequestReasonModal";
import type {
  DonorListingFilter,
  FoodListing,
  AvailabilityBlock,
  FoodRequest,
  FoodRequestWithPickupAllocations,
  PickupSlotSummary,
  ProfileSummary,
  RequestAction,
  UpdateFoodListingInput,
} from "@/types/food";
import {
  advanceFoodRequest,
  createFoodListing,
  deleteFoodListing,
  getAllDonorListings,
  getDonorListings,
  getPickupSlotsForListings,
  getProfilesByUserIds,
  getRequestsForListings,
  replaceListingPickupSlots,
  updateFoodListingDetails,
  declineFoodRequest,
  undoFoodRequestDecline,
} from "@/services/food";
import {
  Badge,
  Button,
  Card,
  IconButton,
  Text,
  TextArea,
  TextField,
  Tooltip,
} from "@radix-ui/themes";
import { toast } from "react-toastify";
import {
  Plus,
  Package,
  MapPin,
  Trash2,
  Copy,
  Pencil,
  CalendarCog,
  CheckCircle,
  XCircle,
  User,
  Check,
  ArrowLeft,
  Undo2,
  X,
} from "lucide-react";

const DonorDashboard = () => {
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [listings, setListings] = useState<FoodListing[]>([]);
  const [summaryListings, setSummaryListings] = useState<FoodListing[]>([]);
  const [listingFilter, setListingFilter] =
    useState<DonorListingFilter>("pending");
  const [requests, setRequests] = useState<FoodRequestWithPickupAllocations[]>(
    [],
  );
  const [receiverProfiles, setReceiverProfiles] = useState<
    Map<string, ProfileSummary>
  >(new Map());
  const [showForm, setShowForm] = useState(false);
  const [addStep, setAddStep] = useState<1 | 2>(1);
  const [selectedAction, setSelectedAction] = useState<{
    requestId: string;
    action: Extract<RequestAction, "complete" | "decline">;
  } | null>(null);
  const [managedListingId, setManagedListingId] = useState<string | null>(null);
  const [editingListing, setEditingListing] =
    useState<UpdateFoodListingInput | null>(null);
  const [savingListing, setSavingListing] = useState(false);
  const [managedBlocks, setManagedBlocks] = useState<AvailabilityBlock[]>([]);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [foodName, setFoodName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [location, setLocation] = useState("");
  const [expiryTime, setExpiryTime] = useState("");
  const [pickupBlocks, setPickupBlocks] = useState<AvailabilityBlock[]>([]);
  const [pickupSlotsByListing, setPickupSlotsByListing] = useState<
    Record<string, PickupSlotSummary[]>
  >({});
  const [listingNotes, setListingNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [sourcePhotoPath, setSourcePhotoPath] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Json | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiFilled, setAiFilled] = useState(false);
  const [locationSource, setLocationSource] = useState<
    "gps" | "previous" | null
  >(null);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const addFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  const resetForm = () => {
    setAddStep(1);
    setFoodName("");
    setQuantity("");
    setLocation("");
    setExpiryTime("");
    setPickupBlocks([]);
    setListingNotes("");
    setPhoto(null);
    setSourcePhotoPath(null);
    setAnalysis(null);
    setAiFilled(false);
    setLocationSource(null);
  };

  // Prefill Pickup Location and Food expiration when the Add Food form opens.
  const fillDefaults = () => {
    setLocation((current) => current || FEATHERINGILL_ADDRESS);
    setExpiryTime((current) =>
      current && new Date(current).getTime() > Date.now() ? current : defaultExpiryTime(),
    );
  };

  useEffect(() => {
    if (showForm && addStep === 1 && !editingListing) fillDefaults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm]);

  const donorId = user?.id;

  const fetchListings = useCallback(async () => {
    if (!donorId) return;
    try {
      const loadedListings = await getDonorListings(donorId, listingFilter);
      setListings(loadedListings);
      const slots = await getPickupSlotsForListings(
        loadedListings.map((listing) => listing.id),
      );
      const grouped = slots.reduce<Record<string, PickupSlotSummary[]>>(
        (accumulator, slot) => {
          (accumulator[slot.listing_id] ??= []).push(slot);
          return accumulator;
        },
        {},
      );
      setPickupSlotsByListing(grouped);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to load listings.",
      );
    }
  }, [donorId, listingFilter]);

  const fetchRequests = useCallback(async () => {
    if (!donorId) return;
    try {
      // Get all listings by this donor, then get requests for those listings
      const myListings = await getAllDonorListings(donorId);
      const reqs = await getRequestsForListings(
        myListings.map((listing) => listing.id),
      );
      setSummaryListings(myListings);
      setRequests(reqs);
      const receiverIds = [
        ...new Set(reqs.map((request) => request.receiver_id)),
      ];
      const profiles = await getProfilesByUserIds(receiverIds);
      const profileMap = new Map<string, ProfileSummary>();
      profiles.forEach((profile) => profileMap.set(profile.user_id, profile));
      setReceiverProfiles(profileMap);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to load requests.",
      );
    }
  }, [donorId]);

  const pollDashboard = useCallback(async () => {
    await Promise.all([fetchListings(), fetchRequests()]);
  }, [fetchListings, fetchRequests]);
  usePolling(
    pollDashboard,
    DASHBOARD_POLL_INTERVAL_MS,
    Boolean(user && donorId),
  );

  useEffect(() => {
    if (user) {
      fetchListings();
      fetchRequests();
    }
  }, [fetchListings, fetchRequests, user]);

  useEffect(() => {
    if (!donorId) return;
    const channel = supabase
      .channel(`donor-dashboard-${donorId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "food_listings",
          filter: `donor_id=eq.${donorId}`,
        },
        () => {
          fetchListings();
          fetchRequests();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "food_requests" },
        fetchRequests,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pickup_slots" },
        fetchListings,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "request_pickup_allocations" },
        fetchRequests,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [donorId, fetchListings, fetchRequests]);

  const goToSchedule = () => {
    if (!addFormRef.current?.reportValidity()) return;
    const parsedQuantity = Number.parseInt(quantity, 10);
    if (
      !Number.isInteger(parsedQuantity) ||
      parsedQuantity <= 0 ||
      Number(quantity) !== parsedQuantity
    ) {
      toast.error("Quantity must be a positive whole number.");
      return;
    }
    if (
      !Number.isFinite(new Date(expiryTime).getTime()) ||
      new Date(expiryTime).getTime() <= Date.now()
    ) {
      toast.error("Choose a future expiration time.");
      return;
    }
    if (locationSource) {
      toast.info("Please confirm the pickup location.");
      locationInputRef.current?.focus();
      return;
    }
    setAddStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addStep === 1) {
      goToSchedule();
      return;
    }
    if (!user || submitting || analyzing) return;
    const pickupError = validatePickupBlocks(pickupBlocks);
    if (pickupError) {
      toast.error(pickupError);
      return;
    }
    const expiration = new Date(expiryTime).getTime();
    if (
      pickupBlocks.some(
        (block) => new Date(block.endsAt).getTime() > expiration,
      )
    ) {
      toast.error("All pickup times must end before expiration.");
      return;
    }
    const parsedQuantity = Number.parseInt(quantity, 10);
    if (
      !Number.isInteger(parsedQuantity) ||
      parsedQuantity <= 0 ||
      Number(quantity) !== parsedQuantity
    ) {
      toast.error("Quantity must be a positive whole number.");
      return;
    }
    if (locationSource) {
      toast.info("Please confirm the pickup location.");
      locationInputRef.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await createFoodListing(
        {
          donor_id: user.id,
          food_name: foodName,
          quantity: parsedQuantity,
          location,
          expiryTime,
          coordinates:
            location.trim() === FEATHERINGILL_ADDRESS
              ? { lat: FEATHERINGILL.lat, lng: FEATHERINGILL.lng }
              : await geocodeAddress(location),
          notes: listingNotes.trim() || null,
          pickupBlocks,
          foodAnalysis: analysis,
          sourcePhotoPath,
        },
        photo || undefined,
      );
      toast.success("Food listing added!");
      resetForm();
      setShowForm(false);
      fetchListings();
      fetchRequests();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to create listing.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteFoodListing(id);
      toast.success("Listing removed");
      fetchListings();
      fetchRequests();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to remove listing.",
      );
    }
  };

  const handleDuplicateListing = (listing: FoodListing) => {
    const duplicatedBlocks = getDuplicatedPickupBlocks(
      pickupSlotsByListing[listing.id] || [],
      listing.expiry_time,
    );

    setAddStep(1);
    setFoodName(listing.food_name);
    setQuantity(String(listing.original_quantity));
    setLocation(listing.location);
    setExpiryTime(toDatetimeLocal(new Date(listing.expiry_time)));
    setListingNotes(listing.notes || "");
    setPickupBlocks(duplicatedBlocks);
    setPhoto(null);
    setSourcePhotoPath(listing.photo_path);
    setAnalysis(listing.food_analysis);
    setAiFilled(Boolean(listing.food_analysis));
    setShowForm(true);
  };

  const allocatedForListing = (listingId: string) =>
    requests
      .filter(
        (request) =>
          request.listing_id === listingId &&
          ["pending", "pending_pickup", "completed"].includes(request.status),
      )
      .reduce((sum, request) => sum + request.quantity, 0);
  const editAllocatedQuantity = editingListing
    ? allocatedForListing(editingListing.listingId)
    : 0;

  const openEditListing = (listing: FoodListing) => {
    setEditingListing({
      listingId: listing.id,
      foodName: listing.food_name,
      totalQuantity: listing.original_quantity,
      location: listing.location,
      expiryTime: toDatetimeLocal(new Date(listing.expiry_time)),
      notes: listing.notes,
    });
  };

  const saveEditedListing = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingListing) return;
    const foodName = editingListing.foodName.trim();
    const location = editingListing.location.trim();
    const totalQuantity = Number.parseInt(
      String(editingListing.totalQuantity),
      10,
    );
    if (!foodName || !location) {
      toast.error("Food name and pickup location are required.");
      return;
    }
    if (
      !Number.isInteger(totalQuantity) ||
      totalQuantity <= 0 ||
      totalQuantity < editAllocatedQuantity
    ) {
      toast.error("Total quantity must cover allocated items.");
      return;
    }
    setSavingListing(true);
    try {
      await updateFoodListingDetails({
        ...editingListing,
        foodName,
        location,
        totalQuantity,
        notes: editingListing.notes?.trim() || null,
      });
      toast.success("Listing updated.");
      setEditingListing(null);
      fetchListings();
      fetchRequests();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update listing.",
      );
    } finally {
      setSavingListing(false);
    }
  };

  const openManageSchedule = (listing: FoodListing) => {
    setManagedListingId(listing.id);
    setManagedBlocks(
      (pickupSlotsByListing[listing.id] || []).map((slot) => ({
        startsAt: slot.starts_at,
        endsAt: slot.ends_at,
      })),
    );
  };

  const managedListing = managedListingId
    ? summaryListings.find((listing) => listing.id === managedListingId)
    : undefined;
  const managedSlots = managedListingId
    ? pickupSlotsByListing[managedListingId] || []
    : [];
  const lockedSlotIds = new Set(
    requests
      .filter((request) => request.listing_id === managedListingId)
      .flatMap((request) =>
        request.allocations.map((allocation) => allocation.pickup_slot_id),
      ),
  );
  const lockedStarts = new Set(
    managedSlots
      .filter((slot) => lockedSlotIds.has(slot.id))
      .map((slot) => canonicalPickupTimestamp(slot.starts_at)),
  );

  const saveSchedule = async () => {
    if (!managedListingId) return;
    setSavingSchedule(true);
    try {
      const originalSlots = pickupSlotsByListing[managedListingId] || [];
      const desired = expandAvailabilityBlocks(managedBlocks);
      const desiredStarts = new Set(
        desired.map((block) => canonicalPickupTimestamp(block.startsAt)),
      );
      const removeIds = originalSlots
        .filter(
          (slot) =>
            !desiredStarts.has(canonicalPickupTimestamp(slot.starts_at)),
        )
        .map((slot) => slot.id);
      const originalStarts = new Set(
        originalSlots.map((slot) => canonicalPickupTimestamp(slot.starts_at)),
      );
      const newBlocks = desired.filter(
        (block) =>
          !originalStarts.has(canonicalPickupTimestamp(block.startsAt)),
      );
      await replaceListingPickupSlots(managedListingId, removeIds, newBlocks);
      toast.success("Pickup schedule updated.");
      setManagedListingId(null);
      fetchListings();
      fetchRequests();
    } catch (error) {
      toast.error(getErrorMessage(error, "Unable to update pickup schedule."));
    } finally {
      setSavingSchedule(false);
    }
  };

  const applyUpdatedRequest = (updatedRequest: FoodRequest) => {
    setRequests(current => current.map(request =>
      request.id === updatedRequest.id ? { ...request, ...updatedRequest } : request,
    ));
  };

  const handleAdvanceRequest = async (
    requestId: string,
    direction: "forward" | "back",
    note?: string,
  ) => {
    try {
      const updatedRequest = await advanceFoodRequest(
        requestId,
        direction,
        note,
      );
      applyUpdatedRequest(updatedRequest);
      toast.success(
        direction === "forward" ? "Request advanced." : "Request moved back.",
      );
      await Promise.all([fetchListings(), fetchRequests()]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update request.",
      );
      throw error;
    }
  };

  const handleDeclineRequest = async (requestId: string, note?: string) => {
    try {
      const updatedRequest = await declineFoodRequest(requestId, note);
      applyUpdatedRequest(updatedRequest);
      toast.success("Request declined");
      await Promise.all([fetchListings(), fetchRequests()]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to decline request.",
      );
      throw error;
    }
  };

  const handleUndoDecline = async (requestId: string) => {
    try {
      const updatedRequest = await undoFoodRequestDecline(requestId);
      applyUpdatedRequest(updatedRequest);
      toast.success("Decline undone.");
      await Promise.all([fetchListings(), fetchRequests()]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to undo decline.",
      );
    }
  };

  const handleAcceptRequest = (requestId: string) =>
    handleAdvanceRequest(requestId, "forward");
  const handleBackRequest = (requestId: string) =>
    handleAdvanceRequest(requestId, "back");

  const getRequestsForListing = (listingId: string) =>
    requests.filter((request) => request.listing_id === listingId);

  const listingDisplayStatus = getListingDisplayStatus;
  const donorName = profile?.full_name?.split(" ")[0] || "there";
  const pendingRequestListingIds = new Set(
    requests
      .filter((request) => ["pending", "pending_pickup"].includes(request.status))
      .map((request) => request.listing_id),
  );
  const pendingPickupListingIds = new Set(
    requests
      .filter((request) => request.status === "pending_pickup")
      .map((request) => request.listing_id),
  );
  const completedRequestListingIds = new Set(
    requests
      .filter((request) => request.status === "completed")
      .map((request) => request.listing_id),
  );
  const pendingListings = summaryListings.filter((item) =>
    pendingRequestListingIds.has(item.id),
  ).length;
  const availableListings = summaryListings.filter(
    (item) =>
      new Date(item.expiry_time).getTime() > Date.now() &&
      (item.quantity > 0 || pendingPickupListingIds.has(item.id)),
  ).length;
  const doneListings = summaryListings.filter((item) =>
    completedRequestListingIds.has(item.id),
  ).length;

  if (authLoading) return null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Navbar />
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="container mx-auto max-w-5xl px-4 py-10">
          <section className="hero-gradient mb-4 rounded-2xl p-6 text-primary-foreground md:p-8">
            <div>
              <div className="flex items-center justify-between gap-4">
                <h1 className="text-3xl font-heading font-bold">
                  Hi, {donorName}
                </h1>
                <Badge
                  color="green"
                  variant="soft"
                  className="bg-background/90 text-primary"
                >
                  Donor Dashboard
                </Badge>
              </div>
              <p className="mt-1 text-primary-foreground/85">
                Manage donations and respond to community requests.
              </p>
            </div>
          </section>
          <DonorSummaryFilters
            listingFilter={listingFilter}
            pendingListings={pendingListings}
            availableListings={availableListings}
            doneListings={doneListings}
            totalListings={summaryListings.length}
            onFilterChange={setListingFilter}
          />

          {listings.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p>
                {listingFilter === "pending"
                  ? "No pending orders."
                  : listingFilter === "available"
                    ? "No available orders."
                    : "No completed orders."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {listings.map((item) => {
                const itemRequests = getRequestsForListing(item.id);
                return (
                  <DonorListingCard
                    key={item.id}
                    listing={item}
                    requests={itemRequests}
                    receiverProfiles={receiverProfiles}
                    pickupSlots={pickupSlotsByListing[item.id] || []}
                    displayStatus={listingDisplayStatus(item, itemRequests)}
                    onEdit={openEditListing}
                    onManage={openManageSchedule}
                    onDuplicate={handleDuplicateListing}
                    onDelete={handleDelete}
                    onAccept={handleAcceptRequest}
                    onBack={handleBackRequest}
                    onDecline={(requestId) =>
                      setSelectedAction({ requestId, action: "decline" })
                    }
                    onDone={(requestId) =>
                      setSelectedAction({ requestId, action: "complete" })
                    }
                    onUndo={handleUndoDecline}
                  />
                );
              })}
            </div>
          )}
        </div>
      </main>
      <DonorAddListingModal open={showForm} onOpenChange={open => { if (!open && (submitting || analyzing)) return; setShowForm(open); if (!open) resetForm(); }} step={addStep} onStepChange={setAddStep} draft={{ foodName, quantity, location, expiryTime, pickupBlocks, notes: listingNotes }} onDraftChange={draft => { setFoodName(draft.foodName); setQuantity(draft.quantity); setLocation(draft.location); setExpiryTime(draft.expiryTime); setPickupBlocks(draft.pickupBlocks); setListingNotes(draft.notes); }} formRef={addFormRef} locationInputRef={locationInputRef} onSubmit={handleSubmit} onNext={goToSchedule} submitting={submitting} analyzing={analyzing} sourcePhotoPath={sourcePhotoPath} locationSource={locationSource} onConfirmLocation={() => setLocationSource(null)} onPhotoChange={value => { setPhoto(value); setSourcePhotoPath(null); }} onBusyChange={setAnalyzing} onSuggestion={suggestion => { setAnalysis(suggestion ? { ...suggestion } : null); setAiFilled(Boolean(suggestion?.isFood)); if (suggestion?.isFood) { setFoodName(suggestion.foodName); if (suggestion.quantity !== null) setQuantity(String(suggestion.quantity)); fillDefaults(); } }} />
      <DonorManageScheduleModal open={Boolean(managedListingId)} blocks={managedBlocks} onBlocksChange={setManagedBlocks} lockedStarts={lockedStarts} maxDateTime={managedListing?.expiry_time} saving={savingSchedule} onClose={() => setManagedListingId(null)} onSave={saveSchedule} />
      <DonorEditListingModal listing={editingListing} allocatedQuantity={editAllocatedQuantity} saving={savingListing} onChange={setEditingListing} onClose={() => setEditingListing(null)} onSubmit={saveEditedListing} />
      {selectedAction && (
        <RequestReasonModal
          open
          action={selectedAction.action}
          onOpenChange={(open) => {
            if (!open) setSelectedAction(null);
          }}
          onSubmit={(note) =>
            selectedAction.action === "complete"
              ? handleAdvanceRequest(selectedAction.requestId, "forward", note)
              : handleDeclineRequest(selectedAction.requestId, note)
          }
        />
      )}
    </div>
  );
};

export default DonorDashboard;
