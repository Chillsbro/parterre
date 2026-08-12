export function getManagedVideoStartArgs(
  args: string[],
  recordingPath: string
): string[] {
  const options = args.flatMap((argument, index) => {
    if (argument.startsWith("-")) return [argument];
    return args[index - 1] === "--size" ? [argument] : [];
  });
  return [recordingPath, ...options];
}
