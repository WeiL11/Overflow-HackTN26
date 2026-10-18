import { Badge } from '@radix-ui/themes';
import { CircleCheckBig, CircleX, HandHeart, PackageCheck, Truck } from 'lucide-react';

export type ListingStage = 'available' | 'requested' | 'pending_pickup' | 'completed' | 'rejected' | 'cancelled';

interface ListingTimelineProps {
  stage: ListingStage;
}

const ListingTimeline = ({ stage }: ListingTimelineProps) => {
  const currentIndex = stage === 'available' ? 0 : stage === 'requested' || stage === 'rejected' || stage === 'cancelled' ? 1 : stage === 'pending_pickup' ? 2 : 3;
  const currentLabel = stage === 'rejected'
    ? 'Request declined'
    : stage === 'cancelled'
      ? 'Request cancelled'
      : stage === 'completed'
        ? 'Done'
        : stage === 'pending_pickup'
          ? 'Pending Pickup'
          : stage[0].toUpperCase() + stage.slice(1);
  const currentColor = stage === 'rejected' ? 'red' : stage === 'cancelled' ? 'gray' : stage === 'requested' ? 'amber' : stage === 'pending_pickup' ? 'blue' : 'green';
  const progressWidth = currentIndex === 0 ? '0%' : currentIndex === 1 ? '25%' : currentIndex === 2 ? '50%' : '75%';
  const progressClass = stage === 'rejected'
    ? 'bg-red-400'
    : stage === 'cancelled'
      ? 'bg-gray-400'
      : stage === 'requested'
        ? 'bg-amber-400'
        : stage === 'pending_pickup'
          ? 'bg-blue-400'
          : 'bg-emerald-400';
  const stages = [
    { label: 'Available', Icon: PackageCheck },
    { label: stage === 'rejected' ? 'Request declined' : stage === 'cancelled' ? 'Request cancelled' : 'Requested', Icon: stage === 'rejected' || stage === 'cancelled' ? CircleX : HandHeart },
    { label: 'Pending Pickup', Icon: Truck },
    { label: 'Done', Icon: CircleCheckBig },
  ];

  return (
    <div className="mt-4 border-t pt-4" aria-label={`Item stage: ${currentLabel}`}>
      <div className="mb-3 flex justify-start">
        <Badge color={currentColor} variant="soft" size="1">Current: {currentLabel}</Badge>
      </div>
      <div className="relative flex" role="list">
        <div className="absolute left-[12.5%] right-[12.5%] top-4 h-0.5 bg-gray-200" aria-hidden="true" />
        <div
          className={`absolute left-[12.5%] top-4 h-0.5 ${progressClass}`}
          style={{ width: progressWidth }}
          aria-hidden="true"
        />
        {stages.map(({ label, Icon }, index) => {
          const isCurrent = index === currentIndex;
          const isFuture = index > currentIndex;
          const nodeClass = isFuture
            ? 'border-gray-200 bg-gray-100 text-gray-400'
            : stage === 'rejected' && index === 1
              ? 'border-red-400 bg-red-50 text-red-600'
              : stage === 'cancelled' && index === 1
                ? 'border-gray-400 bg-gray-100 text-gray-500'
                : stage === 'requested' && index === 1
                  ? 'border-amber-400 bg-amber-50 text-amber-600'
                  : stage === 'pending_pickup' && index === 2
                    ? 'border-blue-400 bg-blue-50 text-blue-600'
                    : 'border-emerald-500 bg-emerald-50 text-emerald-600';
          const labelClass = isFuture
            ? 'text-muted-foreground'
            : stage === 'rejected' && index === 1
              ? 'text-red-600'
              : stage === 'cancelled' && index === 1
                ? 'text-gray-500'
                : stage === 'requested' && index === 1
                  ? 'text-amber-600'
                  : stage === 'pending_pickup' && index === 2
                    ? 'text-blue-600'
                    : 'text-emerald-600';
          return (
            <div key={label} className="relative flex flex-1 flex-col items-center text-center" role="listitem">
              <div className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 ${nodeClass}`}>
                <Icon className="h-4 w-4" />
              </div>
              <span className={`mt-2 text-xs font-medium ${labelClass}`} aria-current={isCurrent ? 'step' : undefined}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ListingTimeline;
