import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import AppModal from '@/components/AppModal';

describe('AppModal', () => {
  it('opens when its trigger is clicked', () => {
    const Harness = () => {
      const [open, setOpen] = useState(false);
      return (
        <AppModal
          open={open}
          onOpenChange={setOpen}
          trigger={<button type="button">Open modal</button>}
          title="Test modal"
          description="Test description"
        >
          <p>Modal content</p>
        </AppModal>
      );
    };

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open modal' }));

    expect(screen.getByRole('heading', { name: 'Test modal' })).toBeInTheDocument();
    expect(screen.getByText('Modal content')).toBeInTheDocument();
  });
});
