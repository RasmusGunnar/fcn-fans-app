/** Shared V1 transport DTOs. Backend owns eligibility, seats and transitions.
 * Mirrored byte-for-byte in mobile src/services/carpoolContract.ts. */
export type RideStatus = "open" | "full" | "cancelled" | "completed";
export type RequestStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "cancelled"
  | "withdrawn";
export type CarpoolPerson = {
  id: string;
  name: string;
  avatar_url: string | null;
  fan_level_key: string | null;
};
export type CarpoolFixture = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  venue: string | null;
  eligible: boolean;
};
export type CarpoolRide = {
  id: string;
  fixture: CarpoolFixture;
  driver: CarpoolPerson;
  status: RideStatus;
  origin_label: string;
  departure_at: string;
  seat_capacity: number;
  available_seats: number;
  return_offered: boolean;
  return_departure_mode: "none" | "after_match" | "custom";
  return_departure_at: string | null;
  max_detour_minutes: number;
  fuel_contribution_mode: "free" | "agree" | "fixed";
  fuel_contribution_amount: number | null;
  note: string | null;
  vibe_tags: string[];
  created_at: string;
  updated_at: string;
  is_driver: boolean;
  my_request_status: RequestStatus | null;
  request_count: number | null;
};
export type CarpoolRequest = {
  id: string;
  profile: CarpoolPerson;
  status: RequestStatus;
  pickup_label: string;
  pickup_note: string | null;
  message: string | null;
  vibe_tags: string[];
  requested_seats: number;
  detour_estimate_minutes: number | null;
  baseline_seconds?: number | null;
  via_pickup_seconds?: number | null;
  route_match?: "good" | "acceptable" | "moderate" | "outside_preference" | null;
  can_message: boolean;
  created_at: string;
};
export type CarpoolCatalog = {
  enabled: boolean;
  requires_auth: boolean;
  viewer_id?: string;
  fixtures: CarpoolFixture[];
  fixture?: CarpoolFixture | null;
  rides: CarpoolRide[];
  mine: CarpoolRide[];
  summary: { rides: number; seats: number; origins: string[] } | null;
};
export type CarpoolDetail = {
  enabled: boolean;
  viewer_id: string;
  ride: CarpoolRide;
  requests: CarpoolRequest[];
  my_request: CarpoolRequest | null;
  members: CarpoolPerson[];
  conversation_id: string | null;
  can_request: boolean;
};
export type CarpoolAction =
  | "create"
  | "update"
  | "request"
  | "accept"
  | "reject"
  | "withdraw"
  | "cancel"
  | "report";
export type CarpoolResult<T> =
  | { data: T; error: null }
  | { data: null; error: string };
export type CarpoolCommand = { ride_id: string; request_id?: string | null };
export const VIBES = [
  ["energy", "Fuld tribuneenergi"],
  ["social", "Hygge og fodboldsnak"],
  ["quiet", "Rolig tur"],
  ["children", "Børn med"],
  ["alcohol_ok", "Alkohol okay"],
  ["alcohol_free", "Alkoholfri bil"],
] as const;
export const REQUEST_LABEL: Record<RequestStatus, string> = {
  pending: "Afventer svar",
  accepted: "Godkendt",
  rejected: "Afvist",
  cancelled: "Annulleret",
  withdrawn: "Trukket tilbage",
};
export const RIDE_LABEL: Record<RideStatus, string> = {
  open: "Åben tur",
  full: "Alle pladser er optaget",
  cancelled: "Aflyst",
  completed: "Afsluttet",
};
export const SAFETY_COPY =
  "Samkørsel aftales mellem fans. FCN Fan Fællesskab er formidler af kontakt, ikke transportør.";
export const disabledCatalog = (): CarpoolCatalog => ({
  enabled: false,
  requires_auth: false,
  fixtures: [],
  rides: [],
  mine: [],
  summary: null,
});
export const carpoolId = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const carpoolUnavailable = (error: {
  code?: string;
  message?: string;
}) => error.code === "PGRST202" || error.code === "42883";
export function carpoolError(error: unknown): string {
  const e =
    error && typeof error === "object"
      ? (error as { code?: string; message?: string })
      : {};
  if (e.code === "23505")
    return "Du har allerede en tur eller anmodning til denne tur.";
  if (/auth_required|authentication_required/.test(e.message ?? ""))
    return "Log ind med din fanprofil for at fortsætte.";
  if (/full|capacity_below/.test(e.message ?? ""))
    return "Der er ikke plads. Opdatér turen, og kontrollér antal pladser.";
  if (/blocked/.test(e.message ?? ""))
    return "Handlingen er ikke mulig på grund af en blokering.";
  if (/privacy/.test(e.message ?? ""))
    return "Brug by, område eller mødested. Del ikke hjemmeadresse, telefon eller e-mail offentligt.";
  if (/rate_limited/.test(e.message ?? ""))
    return "Vent lidt, før du prøver igen.";
  if (/not_pending|request_closed/.test(e.message ?? ""))
    return "Anmodningen er allerede behandlet. Opdatér turen.";
  if (/disabled|not_open|departed|unavailable|not_found/.test(e.message ?? ""))
    return "Turen er ikke tilgængelig for denne handling. Opdatér oversigten.";
  if (/time_invalid/.test(e.message ?? ""))
    return "Vælg en fremtidig afgang før kampen og en eventuel retur efter kampen.";
  if (/adult_confirmation/.test(e.message ?? ""))
    return "Bekræft, at du er fyldt 18 år. Én profil svarer til én plads.";
  if (e.code === "23514" || e.code === "23502" || e.code === "22023")
    return "Kontrollér felterne: 1–4 pladser, højst 3 stemninger og gyldige tidspunkter.";
  return "Samkørsel kunne ikke opdateres. Prøv igen.";
}
export const rideTime = (value: string) =>
  new Date(value).toLocaleString("da-DK", {
    timeZone: "Europe/Copenhagen",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
export const returnLabel = (r: CarpoolRide) =>
  r.return_departure_mode === "none"
    ? "Kun udrejse"
    : r.return_departure_mode === "after_match"
      ? "Ud + retur efter kampen"
      : `Ud + retur ${rideTime(r.return_departure_at!)}`;
export const fuelLabel = (r: CarpoolRide) =>
  r.fuel_contribution_mode === "free"
    ? "Gratis"
    : r.fuel_contribution_mode === "fixed"
      ? `${r.fuel_contribution_amount} kr.`
      : "Aftales";
export const vibeLabel = (tag: string) =>
  VIBES.find((v) => v[0] === tag)?.[1] ?? tag;

export const ROUTING_POINT_HELP =
  "Valgfrit: koordinater for et offentligt mødested (breddegrad, længdegrad). Afrundes til et område på ca. 1 km. Kun koordinater sendes til OpenRouteService; vises ikke på turkortet.";
export function parseApproxPoint(value: string): [number, number] | undefined {
  if (!value.trim()) return undefined;
  const parts = value.trim().split(/[,;]\s*/);
  const values = parts.map(Number);
  if (parts.length !== 2 || parts.some(p => !p.trim()) || !values.every(Number.isFinite) ||
      Math.abs(values[0]) > 90 || Math.abs(values[1]) > 180)
    throw new Error("Angiv breddegrad, længdegrad — fx 55.81, 12.38.");
  return [Math.round(values[1] * 100) / 100, Math.round(values[0] * 100) / 100];
}
export function routeAdvice(minutes: number | null | undefined, max: number): string {
  if (minutes == null) return "Omvej kunne ikke beregnes";
  return minutes > max
    ? `Ca. +${minutes} min. — over chaufførens ønskede maks. ${max} min.`
    : `Ca. +${minutes} min. omvej · ${minutes <= 5 ? "Godt rutematch" : minutes <= 10 ? "Acceptabelt rutematch" : "Moderat rutematch"}`;
}
