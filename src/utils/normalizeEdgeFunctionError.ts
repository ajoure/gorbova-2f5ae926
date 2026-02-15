/**
 * Normalizes Edge Function errors into user-friendly messages.
 */
export function normalizeEdgeFunctionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (
    message.includes("Edge Function returned a non-2xx status code") ||
    message.includes("FunctionsHttpError") ||
    message.includes("Failed to fetch")
  ) {
    return "Функция временно недоступна. Попробуйте через 10 секунд.";
  }

  if (message.includes("FunctionsRelayError") || message.includes("timeout")) {
    return "Превышено время ожидания. Попробуйте ещё раз.";
  }

  return message;
}
