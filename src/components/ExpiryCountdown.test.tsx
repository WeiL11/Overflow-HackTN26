import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ExpiryCountdown from './ExpiryCountdown';

afterEach(() => {
  vi.useRealTimers();
});

describe('ExpiryCountdown', () => {
  it('updates the shared countdown as time passes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T12:00:00.000Z'));
    render(<ExpiryCountdown expiryTime="2026-10-18T12:02:00.000Z" />);

    expect(screen.getByText('2m left')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(screen.getByText('0m left')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(59_000);
    });
    expect(screen.getByText('Expired')).toBeInTheDocument();
  });

  it('refreshes immediately when the expiration changes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T12:00:00.000Z'));
    const { rerender } = render(<ExpiryCountdown expiryTime="2026-10-18T13:00:00.000Z" />);

    rerender(<ExpiryCountdown expiryTime="2026-10-18T12:30:00.000Z" />);
    expect(screen.getByText('30m left')).toBeInTheDocument();
  });
});
