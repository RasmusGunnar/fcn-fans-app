export type DatabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

export type MediaArticleApprovalErrorDetails = {
  code: string;
  message: string;
  details: string;
  hint: string;
  summary: string;
  debugMessage: string;
};

function readErrorField(error: unknown, field: keyof DatabaseErrorLike): string {
  if (!error || typeof error !== 'object') {
    return '';
  }

  const value = (error as DatabaseErrorLike)[field];
  return typeof value === 'string' ? value.trim() : '';
}

function getApprovalErrorSummary(code: string, message: string): string {
  if (code === 'PGRST202' || /function .* not found|schema cache/i.test(message)) {
    return 'Godkendelsesfunktionen mangler i databasen.';
  }
  if (code === '42501') {
    return 'Din bruger har ikke administratoradgang til at publicere.';
  }
  if (code === '23505') {
    return 'Artiklen er allerede publiceret.';
  }
  if (code === '23502') {
    return 'Et påkrævet databasefelt mangler.';
  }
  if (code === '23503') {
    return 'Brugeren eller en relateret databasepost mangler.';
  }
  if (code === '23514') {
    return 'Artiklen opfylder ikke databasekravene.';
  }
  if (code === '42804') {
    return 'Databasens felttyper matcher ikke godkendelsesfunktionen.';
  }
  if (code === 'P0002') {
    return 'Kandidaten findes ikke længere.';
  }
  if (/only pending/i.test(message)) {
    return 'Kun afventende kandidater kan publiceres.';
  }

  return 'Databasen afviste publiceringen.';
}

export function describeMediaArticleApprovalError(
  error: unknown,
): MediaArticleApprovalErrorDetails {
  const code = readErrorField(error, 'code') || 'UNKNOWN';
  const message =
    readErrorField(error, 'message') ||
    (error instanceof Error ? error.message : String(error ?? 'Unknown error'));
  const details = readErrorField(error, 'details');
  const hint = readErrorField(error, 'hint');
  const summary = getApprovalErrorSummary(code, message);
  const debugMessage = [
    summary,
    `Kode: ${code}`,
    message ? `Fejl: ${message}` : '',
    details ? `Detaljer: ${details}` : '',
    hint ? `Hint: ${hint}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return { code, message, details, hint, summary, debugMessage };
}
