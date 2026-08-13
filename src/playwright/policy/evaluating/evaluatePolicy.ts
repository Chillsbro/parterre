import {getBrowserCommandDescriptor} from "../../commands/index.js";
import type {PlaywrightRequest} from "../../types/index.js";
import type {PolicyDecision} from "../types/index.js";

export function evaluatePolicy(request: PlaywrightRequest): PolicyDecision {
  const argumentValues = request.args.map(value => String(value));
  if (argumentValues.some(value => value.toLowerCase().startsWith("file:"))) {
    return {
      kind: "deny",
      reason: "Local file navigation is outside the managed browser session"
    };
  }
  const descriptor = getBrowserCommandDescriptor(request.command);
  if (!descriptor) {
    return {
      kind: "deny",
      reason: `Unsupported Playwright command: ${request.command}`
    };
  }
  return {kind: "allow"};
}
