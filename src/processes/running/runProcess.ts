import type {ProcessResult} from "../types/index.js";

export async function runProcess(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env?: Record<string, string>;
    timeoutMs?: number;
    signal?: AbortSignal | undefined;
  }
): Promise<ProcessResult> {
  const startedAt = performance.now();
  const childProcess = Bun.spawn([command, ...args], {
    cwd: options.cwd,
    env: {...Bun.env, ...options.env},
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    ...(options.signal ? {signal: options.signal} : {})
  });
  const timeout = setTimeout(
    () => childProcess.kill(),
    options.timeoutMs ?? 120_000
  );
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      childProcess.exited,
      new Response(childProcess.stdout).text(),
      new Response(childProcess.stderr).text()
    ]);
    return {
      exitCode,
      stdout,
      stderr,
      durationMs: Math.round(performance.now() - startedAt)
    };
  } finally {
    clearTimeout(timeout);
  }
}
