export type PolicyDecision =
  | {kind: "allow"}
  | {kind: "approval"; reason: string}
  | {kind: "deny"; reason: string};
