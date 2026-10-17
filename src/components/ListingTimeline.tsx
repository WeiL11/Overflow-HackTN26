import { Badge } from '@radix-ui/themes';
import { CircleCheckBig, CircleX, HandHeart, PackageCheck } from 'lucide-react';

export type ListingStage = 'available' | 'requested' | 'completed' | 'rejected';

interface ListingTimelineProps {
  stage: ListingStage;
}

export default function ListingTimeline({ stage }: ListingTimelineProps) {
  const currentIndex = stage === 'available' ? 0 : stage === 'completed' ? 2 : 1;
  const currentLabel = stage === 'rejected' ? 'Request declined' : stage[0].toUpperCase() + stage.slice(1);
  const currentColor = stage === 'rejected' ? 'red' : stage === 'requested' ? 'amber' : 'green';
  const progressWidth = currentIndex === 0 ? '0%' : currentIndex === 1 ? '33.3333%' : '66.6666%';
  const progressClass = stage === 'rejected'
    ? 'bg-red-400'
    : stage === 'requested'
      ? 'bg-amber-400'
      : 'bg-emerald-400';
  const stages = [
    { label: 'Available', Icon: PackageCheck },
    { label: stage === 'rejected' ? 'Request declined' : 'Requested', Icon: stage === 'rejected' ? CircleX : HandHeart },
    { label: 'Completed', Icon: CircleCheckBig },
  ];

  return (
    <div className="mt-4 border-t pt-4" aria-label={`Item stage: ${currentLabel}`}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Item timeline</p>
        <Badge color={currentColor} variant="soft" size="1">Current: {currentLabel}</Badge>
      </div>
      <div className="relative flex" role="list">
        <div className="absolute left-[16.6667%] right-[16.6667%] top-4 h-0.5 bg-gray-200" aria-hidden="true" />
        <div
          className={`absolute left-[16.6667%] top-4 h-0.5 ${progressClass}`}
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
              : stage === 'requested' && index === 1
                ? 'border-amber-400 bg-amber-50 text-amber-600'
                : 'border-emerald-500 bg-emerald-50 text-emerald-600';
          return (
            <div key={label} className="relative flex flex-1 flex-col items-center text-center" role="listitem">
              <div className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 ${nodeClass}`}>
                <Icon className="h-4 w-4" />
              </div>
              <span
                className={`mt-2 text-xs font-medium ${isFuture ? 'text-muted-foreground' : stage === 'rejected' && index === 1 ? 'text-red-600' : stage === 'requested' && index === 1 ? 'text-amber-600' : 'text-emerald-600'}`}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
