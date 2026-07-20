export function isCliStartTimeout(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /timeout waiting for cli server to start/i.test(message);
}
