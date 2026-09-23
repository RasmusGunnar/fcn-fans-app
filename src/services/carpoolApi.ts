import { supabase } from '../lib/supabase';
import { carpoolError, carpoolId, carpoolUnavailable, disabledCatalog } from './carpoolContract';
import type {
  CarpoolAction,
  CarpoolCatalog,
  CarpoolCommand,
  CarpoolDetail,
} from './carpoolContract';

export async function fetchCarpoolCatalog(fixtureId?: string): Promise<CarpoolCatalog> {
  if (fixtureId && !carpoolId(fixtureId)) throw new Error('Vælg en kommende udebanekamp.');
  const { data, error } = await supabase.rpc('carpool_catalog', { p_fixture: fixtureId ?? null });
  if (error) {
    if (carpoolUnavailable(error)) return disabledCatalog();
    throw new Error(carpoolError(error));
  }
  return data as CarpoolCatalog;
}
export async function fetchCarpoolDetail(rideId: string): Promise<CarpoolDetail> {
  if (!carpoolId(rideId)) throw new Error('Turen findes ikke.');
  const { data, error } = await supabase.rpc('carpool_detail', { p_ride: rideId });
  if (error) throw new Error(carpoolError(error));
  return data as CarpoolDetail;
}
export async function refreshCarpoolRoute(requestId: string): Promise<void> {
  if (!carpoolId(requestId)) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    await supabase.functions.invoke('carpool-route', {
      body: { request_id: requestId }, signal: controller.signal,
    });
  } catch {
    // Already committed requests stay successful even offline/on older runtimes.
  } finally {
    clearTimeout(timeout);
  }
}
export async function commandCarpool(
  action: CarpoolAction,
  rideId?: string,
  requestId?: string,
  input: Record<string, unknown> = {},
): Promise<CarpoolCommand> {
  const { data, error } = await supabase.rpc('carpool_command', {
    p_action: action,
    p_ride: rideId ?? null,
    p_request: requestId ?? null,
    p_input: input,
  });
  if (error) throw new Error(carpoolError(error));
  if (action === 'request' && data?.request_id) await refreshCarpoolRoute(data.request_id);
  return data as CarpoolCommand;
}
