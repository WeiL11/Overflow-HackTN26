import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RequestReasonModal from '@/components/RequestReasonModal';

describe('RequestReasonModal', () => {
  it('submits the trimmed note for the selected action', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(
      <RequestReasonModal
        open
        action="decline"
        onOpenChange={onOpenChange}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: '  No longer available  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('No longer available'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('supports completion notes with the Done action', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<RequestReasonModal open action="complete" onOpenChange={vi.fn()} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'Pickup completed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Pickup completed'));
  });
});
