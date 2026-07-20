import type {SessionEvent} from "../types/index.js";
import {openSessionDatabase} from "./openSessionDatabase.js";
import {redactValue} from "./redactValue.js";

export async function appendSessionEvent(
  storageDir: string,
  sessionId: string,
  event: SessionEvent,
  redactions: string[]
): Promise<void> {
  const serializedEvent = redactValue(JSON.stringify(event), redactions);
  openSessionDatabase(storageDir)
    .query(
      "INSERT INTO events (sessionId, timestamp, payload) VALUES ($sessionId, $timestamp, $payload)"
    )
    .run({
      $sessionId: sessionId,
      $timestamp: event.timestamp,
      $payload: serializedEvent
    });
}
