import { useEffect, useRef, useState } from 'react';
import { IconButton, ScrollArea, Tooltip } from '@radix-ui/themes';
import { Check, ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import type { AvailabilityBlock, PickupSlotAvailability } from '@/types/food';
import { PickupIntervalMinutes } from '@/types/food';
import { formatPickupWindow, getWeekDays, getWeekStart, mergeSelectedCells } from '@/lib/pickupSlots';

type EditScheduleProps = { mode?: 'edit'; blocks: AvailabilityBlock[]; onChange: (blocks: AvailabilityBlock[]) => void; lockedStarts?: ReadonlySet<string>; showSelectionSummary?: boolean; now?: number; maxDateTime?: string };
type SelectScheduleProps = { mode: 'select'; slots: PickupSlotAvailability[]; selectedSlotId: string; onSelect: (slotId: string) => void; disabled?: boolean; now?: number };
type WeeklyScheduleProps = EditScheduleProps | SelectScheduleProps;

const DAY_MINUTES = 24 * 60;
const formatDay = (day: Date) => day.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' });
const formatTime = (day: Date, minutes: number) => { const time = new Date(day); time.setHours(0, minutes, 0, 0); return time.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true }); };
const cellKey = (day: Date, minutes: number) => { const cell = new Date(day); cell.setHours(0, minutes, 0, 0); return cell.toISOString(); };

const WeeklySchedule = (props: WeeklyScheduleProps) => {
  const isSelect = props.mode === 'select';
  const blocks = isSelect ? [] : props.blocks;
  const lockedStarts = isSelect ? new Set<string>() : (props.lockedStarts || new Set());
  const showSelectionSummary = !isSelect && (props.showSelectionSummary ?? true);
  const [weekStart, setWeekStart] = useState(() => getWeekStart());
  const [painting, setPainting] = useState(false);
  const selectedCells = new Set(blocks.flatMap(block => { const cells: string[] = []; for (let time = new Date(block.startsAt).getTime(); time < new Date(block.endsAt).getTime(); time += PickupIntervalMinutes.Fifteen * 60 * 1000) cells.push(new Date(time).toISOString()); return cells; }));
  const days = getWeekDays(weekStart);
  const times = Array.from({ length: DAY_MINUTES / PickupIntervalMinutes.Fifteen }, (_, index) => index * PickupIntervalMinutes.Fifteen);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const currentTime = props.now ?? Date.now();
  const maxTime = !isSelect && props.maxDateTime ? new Date(props.maxDateTime).getTime() : Number.NaN;
  const slotByStart = isSelect
    ? new Map(props.slots.map(slot => [new Date(slot.starts_at).toISOString(), slot]))
    : new Map<string, PickupSlotAvailability>();

  // Open scrolled to an hour before now, so the selectable times are in view.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const now = new Date(props.now ?? Date.now());
    const rowHeight = 20; // h-5
    const target = Math.max(0, ((now.getHours() - 1) * 60 + now.getMinutes()) / PickupIntervalMinutes.Fifteen * rowHeight);
    // The schedule often mounts inside an opening dialog; retry until the grid has its height.
    let tries = 0;
    const timer = window.setInterval(() => {
      // Radix Themes forwards the ScrollArea ref to the scrolling viewport itself.
      const root = scrollRef.current;
      const viewport = root?.matches('[data-radix-scroll-area-viewport]') ? root : root?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]');
      if (viewport && viewport.scrollHeight > viewport.clientHeight) {
        viewport.scrollTop = target;
        window.clearInterval(timer);
      } else if (++tries > 20) window.clearInterval(timer);
    }, 50);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { const stopPainting = () => setPainting(false); window.addEventListener('pointerup', stopPainting); return () => window.removeEventListener('pointerup', stopPainting); }, []);
  const toggleCell = (key: string) => { if (lockedStarts.has(key)) return; const next = new Set(selectedCells); if (next.has(key)) next.delete(key); else next.add(key); if (!isSelect) props.onChange(mergeSelectedCells([...next])); };

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><Tooltip content="Previous Week"><IconButton type="button" variant="ghost" size="1" aria-label="Previous Week" onClick={() => setWeekStart(date => new Date(date.getTime() - 7 * 86400000))}><ChevronLeft className="h-4 w-4" /></IconButton></Tooltip><span className="text-sm font-medium">{formatDay(days[0])} – {formatDay(days[6])}</span><Tooltip content="Next Week"><IconButton type="button" variant="ghost" size="1" aria-label="Next Week" onClick={() => setWeekStart(date => new Date(date.getTime() + 7 * 86400000))}><ChevronRight className="h-4 w-4" /></IconButton></Tooltip></div>
    <ScrollArea ref={scrollRef} type="auto" scrollbars="both" className="h-[55vh] max-h-[34rem] rounded-lg border"><div className="min-w-[800px]"><div className="sticky top-0 z-20 grid grid-cols-[6.5rem_repeat(7,minmax(0,1fr))] border-b bg-background"><div className="border-r p-2 text-xs text-muted-foreground">Time ({timezone})</div>{days.map(day => <div key={day.toISOString()} className="border-r p-2 text-center text-xs font-medium last:border-r-0">{formatDay(day)}</div>)}</div><div className="grid grid-cols-[6.5rem_repeat(7,minmax(0,1fr))]"><div>{times.map(minutes => <div key={minutes} className="h-5 border-b border-r px-1 text-[10px] text-muted-foreground">{minutes % 60 === 0 ? formatTime(days[0], minutes) : ''}</div>)}</div>{days.map(day => <div key={day.toISOString()} className="border-r last:border-r-0">{times.map(minutes => {
      const key = cellKey(day, minutes);
      const cellStart = new Date(key).getTime();
      const cellEnd = cellStart + PickupIntervalMinutes.Fifteen * 60 * 1000;
      const slot = isSelect ? slotByStart.get(key) : undefined;
      const full = isSelect && (!slot || slot.remaining === 0);
      const historical = cellStart < currentTime;
      const pastExpiration = !isSelect && Number.isFinite(maxTime) && cellEnd > maxTime;
      const selected = isSelect ? slot?.id === props.selectedSlotId : selectedCells.has(key);
      const locked = !isSelect && lockedStarts.has(key);
      const unavailable = isSelect ? historical || !slot || slot.remaining === 0 : historical || pastExpiration || locked;
      const cell = <button key={key} type="button" disabled={isSelect ? props.disabled || unavailable : unavailable} aria-label={isSelect ? (slot ? `${formatPickupWindow(slot)} — ${slot.remaining === 0 ? 'Full' : unavailable ? 'Unavailable' : `${slot.remaining} / ${slot.capacity} available`}` : `Unavailable: No pickup slot at ${new Date(key).toLocaleString()}`) : `${unavailable ? 'Unavailable: ' : ''}${new Date(key).toLocaleString()}`} aria-pressed={selected} aria-disabled={unavailable} onPointerDown={() => { if (isSelect && slot && !unavailable) props.onSelect(selected ? '' : slot.id); if (!isSelect && !unavailable) { setPainting(true); toggleCell(key); } }} onPointerEnter={() => { if (!isSelect && painting && !unavailable && !selectedCells.has(key)) toggleCell(key); }} onKeyDown={event => { if (event.key !== ' ' && event.key !== 'Enter') return; event.preventDefault(); if (isSelect && slot && !unavailable) props.onSelect(selected ? '' : slot.id); else if (!isSelect && !unavailable) toggleCell(key); }} className={`relative block h-5 w-full border-b text-left ${unavailable ? 'cursor-not-allowed bg-red-50 text-red-300 dark:bg-red-950/30 dark:text-red-400' : isSelect && selected ? 'bg-green-200 text-green-900 dark:bg-green-900/60 dark:text-green-100' : !isSelect && selected ? 'bg-primary/30' : isSelect ? 'cursor-pointer bg-green-50 hover:bg-green-100 dark:bg-green-950/30 dark:hover:bg-green-900/40' : 'cursor-pointer hover:bg-primary/10'}`}>{locked && <Lock className="absolute right-1 top-0.5 h-3 w-3 text-muted-foreground" />}{isSelect && full && slot && <span className="absolute right-1 top-0 text-[9px]">Full</span>}{isSelect && selected && <span className="absolute inset-0 flex items-center justify-center"><Check className="h-3 w-3 text-green-700 dark:text-green-200" /></span>}</button>;
      return isSelect && slot ? <Tooltip key={key} content={`${formatPickupWindow(slot)} · ${slot.remaining} / ${slot.capacity} available`}>{cell}</Tooltip> : cell;
    })}</div>)}</div></div></ScrollArea>
    {!isSelect && showSelectionSummary && (
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground" aria-live="polite">
        {blocks.map(block => {
          const label = formatPickupWindow({ starts_at: block.startsAt, ends_at: block.endsAt });
          return (
            <Tooltip key={`${block.startsAt}-${block.endsAt}`} content="Click to remove">
              <button
                type="button"
                className="cursor-pointer rounded-full bg-muted px-2.5 py-1 hover:bg-red-50 hover:text-red-700"
                aria-label={`Remove ${label}`}
                onClick={() => props.onChange(blocks.filter(candidate => candidate !== block))}
              >
                {label}
              </button>
            </Tooltip>
          );
        })}
      </div>
    )}
  </div>;
};

export default WeeklySchedule;
