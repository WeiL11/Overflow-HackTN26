export const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.length > 0
  )
    return error.message;
  return fallback;
};

export const errorMessage = (error: unknown, fallback: string): string =>
  getErrorMessage(error, fallback);
