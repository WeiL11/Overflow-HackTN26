import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import FoodSearchForm from '@/components/FoodSearchForm';

vi.mock('@radix-ui/themes', async importOriginal => {
  const actual = await importOriginal<typeof import('@radix-ui/themes')>();
  return {
    ...actual,
    Tooltip: ({ children }: { children: ReactNode }) => children,
  };
});

describe('FoodSearchForm', () => {
  const renderForm = () => {
    const onValueChange = vi.fn();
    const onSubmit = vi.fn();
    const onClear = vi.fn();
    render(
      <FoodSearchForm
          id="search"
          value=""
          resultCount={2}
          onValueChange={onValueChange}
          onSubmit={onSubmit}
          onClear={onClear}
        />
    );
    return { onValueChange, onSubmit, onClear };
  };

  it('reports typing without submitting', () => {
    const { onValueChange, onSubmit } = renderForm();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'bread' } });

    expect(onValueChange).toHaveBeenCalledWith('bread');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the applied query in the result count', () => {
    render(
      <FoodSearchForm
          id="search"
          value="asdf"
          appliedValue="asdf"
          resultCount={0}
          onValueChange={vi.fn()}
          onSubmit={vi.fn()}
          onClear={vi.fn()}
        />
    );

    expect(screen.getByText('0 listings found for “asdf”')).toBeInTheDocument();
  });

  it('hides result counts while editing an unsubmitted modal query', () => {
    render(
      <FoodSearchForm
        id="modal-search"
        value="bread"
        resultCount={2}
        showResultCount={false}
        onValueChange={vi.fn()}
        onSubmit={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(screen.queryByText(/listings found/)).not.toBeInTheDocument();
  });

  it('submits when Search is clicked or the form is submitted', () => {
    const { onSubmit } = renderForm();
    const form = screen.getByRole('textbox').closest('form');

    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    fireEvent.submit(form!);

    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('clears when the input clear action is clicked', () => {
    const onClear = vi.fn();
    render(
      <FoodSearchForm
          id="search"
          value="bread"
          resultCount={1}
          onValueChange={vi.fn()}
          onSubmit={vi.fn()}
          onClear={onClear}
        />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
  });
});
