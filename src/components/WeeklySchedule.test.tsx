import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PickupSlotAvailability } from '@/types/food';
import { getWeekStart } from '@/lib/pickupSlots';
import WeeklySchedule from './WeeklySchedule';

vi.mock('@radix-ui/themes', async importOriginal => {
  const actual = await importOriginal<typeof import('@radix-ui/themes')>();
  return { ...actual, Tooltip: ({ children }: { children: ReactNode }) => children };
});
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });

const slotAt = (day: Date, hour: number, id: string, remaining: number): PickupSlotAvailability => {
  const start = new Date(day); start.setHours(hour, 0, 0, 0);
  return { id, listing_id: 'listing', starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 15 * 60 * 1000).toISOString(), capacity: 5, allocated: 5 - remaining, remaining, created_at: start.toISOString() };
};

describe('WeeklySchedule', () => {
  it('selects and switches slots while disabling full slots', () => {
    const day = getWeekStart(new Date());
    const slots = [slotAt(day, 9, 'slot-1', 2), slotAt(day, 10, 'slot-2', 1), slotAt(day, 11, 'full', 0)];
    const onSelect = vi.fn();
    const { rerender } = render(<WeeklySchedule mode="select" slots={slots} selectedSlotId="" onSelect={onSelect} now={0} />);
    const available = screen.getAllByRole('button', { name: /available/ }).filter(button => !button.hasAttribute('disabled'));
    expect(available).toHaveLength(2);
    expect(available[0]).toHaveClass('bg-green-50');
    expect(screen.getByRole('button', { name: /Full/ })).toBeDisabled();

    rerender(<WeeklySchedule mode="select" slots={slots} selectedSlotId="slot-1" onSelect={onSelect} now={0} />);
    const selected = screen.getByRole('button', { name: /2 \/ 5 available/ });
    expect(selected).toHaveClass('bg-green-200');
    expect(selected).not.toHaveClass('border-2');
    expect(selected.querySelector('svg')?.parentElement).toHaveClass('items-center', 'justify-center');
  });

  it('matches equivalent Supabase offset timestamps to calendar cells', () => {
    const day = getWeekStart(new Date());
    const slot = slotAt(day, 9, 'offset-slot', 2);
    slot.starts_at = slot.starts_at.replace('.000Z', '+00:00');
    slot.ends_at = slot.ends_at.replace('.000Z', '+00:00');
    const onSelect = vi.fn();
    render(<WeeklySchedule mode="select" slots={[slot]} selectedSlotId="" onSelect={onSelect} now={0} />);

    const available = screen.getByRole('button', { name: /2 \/ 5 available/ });
    expect(available).toBeEnabled();
    fireEvent.pointerDown(available);
    expect(onSelect).toHaveBeenCalledWith('offset-slot');
  });

  it('disables historical edit cells', () => {
    const onChange = vi.fn();
    render(<WeeklySchedule blocks={[]} onChange={onChange} now={Date.now() + 1} />);
    const unavailable = screen.getAllByRole('button', { name: /Unavailable/ })[0];
    expect(unavailable).toBeDisabled();
    expect(unavailable).toHaveClass('cursor-not-allowed', 'bg-red-50');
  });

  it('disables edit cells ending after expiration while allowing earlier cells', () => {
    const onChange = vi.fn();
    const day = getWeekStart(new Date());
    const max = new Date(day.getTime() + 20 * 60 * 1000).toISOString();
    render(<WeeklySchedule blocks={[]} onChange={onChange} now={day.getTime() - 1} maxDateTime={max} />);
    const cells = screen.getAllByRole('button');
    expect(cells.find(cell => cell.getAttribute('aria-label')?.includes('12:00:00 AM'))).not.toBeDisabled();
    expect(cells.find(cell => cell.getAttribute('aria-label')?.includes('12:15:00 AM'))).toBeDisabled();
  });

  it('disables stale select slots while allowing future slots', () => {
    const day = getWeekStart(new Date());
    const slots = [slotAt(day, 9, 'stale', 2), slotAt(day, 11, 'future', 2)];
    const onSelect = vi.fn();
    render(<WeeklySchedule mode="select" slots={slots} selectedSlotId="" onSelect={onSelect} now={new Date(day.getTime() + 10 * 60 * 60 * 1000).getTime()} />);
    const available = screen.getAllByRole('button', { name: /available/ }).filter(button => !button.hasAttribute('disabled'));
    expect(available).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /Unavailable/ }).some(button => button.hasAttribute('disabled'))).toBe(true);
  });

  it('removes a selected availability block from its summary chip', () => {
    const onChange = vi.fn();
    const day = getWeekStart(new Date());
    const startsAt = new Date(day.getTime() + 9 * 60 * 60 * 1000).toISOString();
    const endsAt = new Date(day.getTime() + 10 * 60 * 60 * 1000).toISOString();
    render(<WeeklySchedule blocks={[{ startsAt, endsAt }]} onChange={onChange} now={0} />);

    fireEvent.click(screen.getByRole('button', { name: /Remove/ }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('paints an edit-mode cell', () => {
    const onChange = vi.fn();
    render(<WeeklySchedule blocks={[]} onChange={onChange} now={getWeekStart(new Date()).getTime() - 1} />);
    fireEvent.pointerDown(screen.getAllByRole('button', { name: /12:00:00 AM/ })[0]);
    expect(onChange).toHaveBeenCalled();
  });
});
