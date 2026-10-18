import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FoodPhotoUpload from './FoodPhotoUpload';
import type { FoodPhotoSuggestion } from '@/types/food-photo';

const { resizeImage, analyzeFoodPhoto } = vi.hoisted(() => ({
  resizeImage: vi.fn(),
  analyzeFoodPhoto: vi.fn(),
}));
vi.mock('@/lib/foodPhoto', () => ({ resizeImage, analyzeFoodPhoto }));
vi.mock('@radix-ui/themes', async importOriginal => {
  const actual = await importOriginal<typeof import('@radix-ui/themes')>();
  return { ...actual, Tooltip: ({ children }: { children: ReactNode }) => children };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const suggestion: FoodPhotoSuggestion = {
  isFood: true,
  foodName: 'Bread',
  quantity: 4,
  shelfLifeHours: null,
  description: 'Fresh bread loaves',
  model: 'test',
};

const renderUpload = () => {
  const callbacks = {
    onPhotoChange: vi.fn(),
    onSuggestion: vi.fn(),
    onBusyChange: vi.fn(),
  };
  render(<FoodPhotoUpload disabled={false} {...callbacks} />);
  return callbacks;
};

describe('FoodPhotoUpload', () => {
  it('shows resize validation errors before analysis', async () => {
    resizeImage.mockRejectedValueOnce(new Error('Choose a JPEG, PNG, or WebP photo up to 5 MB.'));
    const callbacks = renderUpload();

    fireEvent.change(screen.getByLabelText('Food photo'), { target: { files: [new File(['x'], 'food.svg', { type: 'image/svg+xml' })] } });

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Choose a JPEG'));
    expect(callbacks.onPhotoChange).not.toHaveBeenCalled();
    expect(analyzeFoodPhoto).not.toHaveBeenCalled();
  });

  it('passes the resized photo and suggestion callbacks on success', async () => {
    resizeImage.mockResolvedValueOnce('data:image/jpeg;base64,photo');
    analyzeFoodPhoto.mockResolvedValueOnce(suggestion);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ blob: async () => new Blob(['photo'], { type: 'image/jpeg' }) }));
    const callbacks = renderUpload();

    fireEvent.change(screen.getByLabelText('Food photo'), { target: { files: [new File(['photo'], 'food.jpg', { type: 'image/jpeg' })] } });

    await waitFor(() => expect(callbacks.onPhotoChange).toHaveBeenCalledWith(expect.any(File)));
    expect(analyzeFoodPhoto).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Analyze food photo' }));
    await waitFor(() => expect(callbacks.onSuggestion).toHaveBeenCalledWith(suggestion));
    expect(analyzeFoodPhoto).toHaveBeenCalledWith('data:image/jpeg;base64,photo');
    expect(callbacks.onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it('keeps manual entry available and shows errors when analysis fails', async () => {
    resizeImage.mockResolvedValueOnce('data:image/jpeg;base64,photo');
    analyzeFoodPhoto.mockRejectedValueOnce(new Error('Analysis unavailable.'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ blob: async () => new Blob(['photo'], { type: 'image/jpeg' }) }));
    const callbacks = renderUpload();

    fireEvent.change(screen.getByLabelText('Food photo'), { target: { files: [new File(['photo'], 'food.jpg', { type: 'image/jpeg' })] } });

    await waitFor(() => expect(callbacks.onPhotoChange).toHaveBeenCalledWith(expect.any(File)));
    expect(analyzeFoodPhoto).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Analyze food photo' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Analysis unavailable.'));
    expect(callbacks.onSuggestion).toHaveBeenCalledWith(null);
  });
});
