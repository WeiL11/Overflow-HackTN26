import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import FoodPhotoUpload from './FoodPhotoUpload';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const props = () => ({ photo: null, onPhoto: vi.fn(), onAnalysis: vi.fn(), disabled: false, onBusy: vi.fn() });

describe('donor photo upload', () => {
  it('rejects unsupported files before they can be uploaded', () => {
    const callbacks = props();
    render(<FoodPhotoUpload {...callbacks} />);
    fireEvent.change(screen.getByLabelText('Food photo (optional)'), { target: { files: [new File(['text'], 'food.svg', { type: 'image/svg+xml' })] } });
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a JPEG, PNG, or WebP');
    expect(callbacks.onPhoto).toHaveBeenCalledWith(null);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('keeps manual entry available when backend analysis fails', async () => {
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:photo', revokeObjectURL: vi.fn() });
    invoke.mockResolvedValue({ data: null, error: new Error('offline') });
    const callbacks = props();
    render(<FoodPhotoUpload {...callbacks} photo={new File(['photo'], 'food.jpg', { type: 'image/jpeg' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Analyze food photo' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('enter details manually'));
    expect(callbacks.onAnalysis).not.toHaveBeenCalled();
    expect(callbacks.onBusy).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button')).toBeEnabled();
  });
});
