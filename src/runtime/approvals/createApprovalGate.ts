import type {PlaywrightRequest} from "../../playwright/index.js";
import type {SessionEvent} from "../../sessions/index.js";

interface PendingApproval {
  request: PlaywrightRequest;
  resolve(approved: boolean): void;
}

export interface ApprovalGate {
  request(request: PlaywrightRequest, reason: string): Promise<boolean>;
  resolve(requestId: string, approved: boolean): Promise<void>;
  abandonAll(): void;
}

export function createApprovalGate(
  publish: (event: SessionEvent) => Promise<void>
): ApprovalGate {
  const pending = new Map<string, PendingApproval>();
  return {
    async request(request, reason) {
      const decision = new Promise<boolean>(resolve => {
        pending.set(request.id, {request, resolve});
      });
      await publish({
        type: "approval_requested",
        timestamp: new Date().toISOString(),
        request,
        reason
      });
      return decision;
    },
    async resolve(requestId, approved) {
      const entry = pending.get(requestId);
      if (!entry) return;
      pending.delete(requestId);
      await publish({
        type: "approval_resolved",
        timestamp: new Date().toISOString(),
        requestId,
        approved
      });
      entry.resolve(approved);
    },
    abandonAll() {
      for (const entry of pending.values()) {
        entry.resolve(false);
      }
      pending.clear();
    }
  };
}
