export function formatTerminalHyperlink(link: {
  label: string;
  href: string;
}): string {
  return `\u001B]8;;${link.href}\u0007${link.label}\u001B]8;;\u0007`;
}
