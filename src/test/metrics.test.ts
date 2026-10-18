import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { getPublicImpactMetrics } from '@/services/metrics';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

const rpc = vi.mocked(supabase.rpc);

describe('getPublicImpactMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps aggregate values to numeric metrics', async () => {
    rpc.mockResolvedValueOnce({
      data: [{ total_donors: '12', total_recipients: 8, total_meals_saved: null }],
      error: null,
    } as never);

    await expect(getPublicImpactMetrics()).resolves.toEqual({
      totalDonors: 12,
      totalRecipients: 8,
      totalMealsSaved: 0,
    });
  });

  it('propagates RPC errors', async () => {
    const error = new Error('Metrics unavailable');
    rpc.mockResolvedValueOnce({ data: null, error } as never);

    await expect(getPublicImpactMetrics()).rejects.toThrow(error);
  });
});
