import type {AccountInfo} from "@anthropic-ai/claude-agent-sdk";

export function isClaudeAuthenticated(
  account: AccountInfo | undefined,
  apiKey: string | undefined
): boolean {
  return (
    Boolean(apiKey) ||
    Boolean(
      account?.apiProvider ??
        account?.apiKeySource ??
        account?.tokenSource ??
        account?.email
    )
  );
}
