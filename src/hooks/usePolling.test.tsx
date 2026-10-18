import { renderHook, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePolling } from './usePolling';

describe('usePolling', () => {
  afterEach(() => vi.useRealTimers());
  it('polls after the interval, prevents overlap, resumes, and cleans up', async () => {
    vi.useFakeTimers();
    let resolve: (() => void) | undefined;
    const callback = vi.fn(() => new Promise<void>(done => { resolve = done; }));
    const hook = renderHook(() => usePolling(callback, 10_000));
    expect(callback).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(callback).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(callback).toHaveBeenCalledTimes(1);
    await act(async () => { resolve?.(); await Promise.resolve(); await vi.advanceTimersByTimeAsync(10_000); });
    expect(callback).toHaveBeenCalledTimes(2);
    hook.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(callback).toHaveBeenCalledTimes(2);
  });
});
