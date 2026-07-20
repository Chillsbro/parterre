import {getBrowserCommandDescriptor} from "../../commands/index.js";
import type {PlaywrightRequest} from "../../types/index.js";
import type {PolicyDecision} from "../types/index.js";

export function evaluatePolicy(request: PlaywrightRequest): PolicyDecision {
  const argumentValues = request.args.map(value => String(value));
  const sensitiveFlag = argumentValues.find(
    value =>
      value === "--persistent" ||
      value.startsWith("--profile") ||
      value.startsWith("--config") ||
      value.startsWith("--extension") ||
      value.startsWith("--cdp")
  );
  if (sensitiveFlag) {
    return {
      kind: "approval",
      reason: `The ${sensitiveFlag} option can access persistent or external browser state`
    };
  }
  if (argumentValues.some(value => value.toLowerCase().startsWith("file:"))) {
    return {
      kind: "approval",
      reason: "Local file navigation can expose filesystem content"
    };
  }
  const descriptor = getBrowserCommandDescriptor(request.command);
  if (!descriptor) {
    return {
      kind: "deny",
      reason: `Unsupported Playwright command: ${request.command}`
    };
  }
  if (descriptor.tier === "sensitive") {
    return {
      kind: "approval",
      reason: `The ${request.command} command can mutate browser or filesystem state`
    };
  }
  return {kind: "allow"};
}
