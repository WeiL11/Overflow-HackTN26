import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ListingTimeline from '@/components/ListingTimeline';

afterEach(() => cleanup());

describe('ListingTimeline', () => {
  it('marks available as the current stage', () => {
    render(<ListingTimeline stage="available" />);

    expect(screen.getByLabelText('Item stage: Available')).toBeInTheDocument();
    expect(screen.getByText('Available')).toHaveAttribute('aria-current', 'step');
  });

  it('marks requested as the current stage', () => {
    render(<ListingTimeline stage="requested" />);

    expect(screen.getByLabelText('Item stage: Requested')).toBeInTheDocument();
    expect(screen.getByText('Requested')).toHaveAttribute('aria-current', 'step');
  });

  it('marks pending pickup as the current stage', () => {
    render(<ListingTimeline stage="pending_pickup" />);

    expect(screen.getByLabelText('Item stage: Pending Pickup')).toBeInTheDocument();
    expect(screen.getByText('Pending Pickup')).toHaveAttribute('aria-current', 'step');
  });

  it('marks completed as Done', () => {
    render(<ListingTimeline stage="completed" />);

    expect(screen.getByLabelText('Item stage: Done')).toBeInTheDocument();
    expect(screen.getByText('Done')).toHaveAttribute('aria-current', 'step');
  });

  it('shows rejected and cancelled branch states', () => {
    const { rerender } = render(<ListingTimeline stage="rejected" />);

    expect(screen.getByLabelText('Item stage: Request declined')).toBeInTheDocument();
    expect(screen.getByText('Request declined')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Done')).not.toHaveAttribute('aria-current');

    rerender(<ListingTimeline stage="cancelled" />);
    expect(screen.getByLabelText('Item stage: Request cancelled')).toBeInTheDocument();
    expect(screen.getByText('Request cancelled')).toHaveAttribute('aria-current', 'step');
  });
});
