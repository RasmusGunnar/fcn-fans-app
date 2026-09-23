/** Presentation only: membership and write authorization remain in PostgreSQL. */
export const CARPOOL_CHAT_CLOSED = "Turen er aflyst eller afsluttet – chatten er lukket.";
export const CHAT_STATE_UNAVAILABLE = "Chattens status kunne ikke bekræftes. Opdater siden, før du sender en besked.";

export function isCarpoolChatClosedError(error: unknown) {
  return Boolean(error && typeof error === "object" && "message" in error && /\bcarpool_chat_read_only\b/.test(String(error.message)));
}

export function carpoolChatNotice(state: unknown): string | null {
  if (state === null) return null; // Canonical RPC: ordinary conversation, not a ride.
  if (!state || typeof state !== "object" || !("ride_status" in state)) return CHAT_STATE_UNAVAILABLE;
  switch (state.ride_status) {
    case "cancelled": return "Turen er aflyst – chatten er lukket.";
    case "completed": return "Turen er afsluttet – chatten er lukket.";
    case "open": case "full": return null;
    default: return CHAT_STATE_UNAVAILABLE;
  }
}
