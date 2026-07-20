export function redactValue(value: string, redactions: string[]): string {
  return redactions
    .filter(Boolean)
    .reduce(
      (currentValue, secret) => currentValue.replaceAll(secret, "[REDACTED]"),
      value
    );
}
