// Supabase returns errors as plain objects ({ message, code, ... }), not Error instances,
// so read `message` from either before falling back to a generic text.
export const errorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message) {
    return error.message;
  }
  return fallback;
};
