import type { SupabaseClient } from '@supabase/supabase-js';

// Shared wire contract. Eligibility, duration, strength and caps belong to backend.
export type ActivationSignal = { score: number; evaluated_at: string; expires_at: string };
export type ActivationTarget = { type: 'post' | 'news'; id: string };

export function activationScore(signal: ActivationSignal | undefined, now: number): number {
  if (!signal || !Number.isFinite(signal.score) || signal.score < 0 || signal.score > 24) return 0;
  const evaluated = Date.parse(signal.evaluated_at), expires = Date.parse(signal.expires_at);
  if (!Number.isFinite(now) || !Number.isFinite(evaluated) || !Number.isFinite(expires) || expires <= evaluated || now >= expires) return 0;
  return signal.score * Math.min(1, Math.max(0, (expires - now) / (expires - evaluated)));
}

export function decodeActivationSignals(data: unknown, targets: readonly ActivationTarget[]): Map<string, ActivationSignal> {
  const wanted = new Set(targets.map(t => t.type + ':' + t.id));
  const signals = new Map<string, ActivationSignal>();
  if (!Array.isArray(data)) return signals;
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const key = row.target_type + ':' + row.target_id;
    if (!wanted.has(key) || typeof row.score !== 'number' || typeof row.evaluated_at !== 'string' || typeof row.expires_at !== 'string') continue;
    const signal = { score: row.score, evaluated_at: row.evaluated_at, expires_at: row.expires_at };
    if (activationScore(signal, Date.parse(signal.evaluated_at)) > 0) signals.set(key, signal);
  }
  return signals;
}

export async function readActivationSignals(client: Pick<SupabaseClient, 'rpc'>, targets: readonly ActivationTarget[]) {
  const requested = targets.slice(0, 300);
  if (!requested.length) return new Map<string, ActivationSignal>();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const result = await client.rpc('get_content_activation_signals', { p_targets: requested }).abortSignal(controller.signal);
    return result.error ? new Map<string, ActivationSignal>() : decodeActivationSignals(result.data, requested);
  } catch {
    // Old backend / offline / rollout OFF must leave the existing feed usable.
    return new Map<string, ActivationSignal>();
  } finally { clearTimeout(timeout); }
}

