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

  it('marks completed as the current stage', () => {
    render(<ListingTimeline stage="completed" />);

    expect(screen.getByText('Completed')).toHaveAttribute('aria-current', 'step');
  });

  it('shows a declined request as the rejected current stage', () => {
    render(<ListingTimeline stage="rejected" />);

    expect(screen.getByLabelText('Item stage: Request declined')).toBeInTheDocument();
    expect(screen.getByText('Request declined')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Completed')).not.toHaveAttribute('aria-current');
  });
});
