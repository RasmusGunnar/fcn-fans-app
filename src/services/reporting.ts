import { Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';

export type ReportTargetType = 'post' | 'comment' | 'user';

type SubmitReportInput = {
  reporterUserId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason?: string;
};

type ConfirmAndSubmitReportInput = {
  reporterUserId?: string | null;
  targetType: ReportTargetType;
  targetId?: string | null;
  subjectLabel: string;
};

const DEFAULT_REPORT_REASON = 'reported_in_app';
const SUPPORT_EMAIL = 'support@fcnfans.dk';

export async function submitReport({
  reporterUserId,
  targetType,
  targetId,
  reason = DEFAULT_REPORT_REASON,
}: SubmitReportInput): Promise<void> {
  const normalizedReporterUserId = reporterUserId.trim();
  const normalizedTargetId = targetId.trim();
  const normalizedReason = reason.trim();

  if (!normalizedReporterUserId || !normalizedTargetId || !normalizedReason) {
    throw new Error('Rapporten mangler nødvendige oplysninger.');
  }

  const { error } = await supabase.from('reports').insert({
    reporter_user_id: normalizedReporterUserId,
    target_type: targetType,
    target_id: normalizedTargetId,
    reason: normalizedReason,
  });

  if (error) {
    throw error;
  }
}

export function confirmAndSubmitReport({
  reporterUserId,
  targetType,
  targetId,
  subjectLabel,
}: ConfirmAndSubmitReportInput) {
  const normalizedReporterUserId = reporterUserId?.trim() ?? '';
  const normalizedTargetId = targetId?.trim() ?? '';

  if (!normalizedReporterUserId) {
    Alert.alert('Ikke logget ind', 'Du skal være logget ind for at kunne rapportere indhold.');
    return;
  }

  if (!normalizedTargetId) {
    Alert.alert('Kunne ikke rapportere', 'Det valgte indhold kunne ikke identificeres.');
    return;
  }

  Alert.alert(
    `Rapportér ${subjectLabel}?`,
    'Vi gemmer din rapport til manuel gennemgang.',
    [
      { text: 'Annuller', style: 'cancel' },
      {
        text: 'Rapportér',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await submitReport({
                reporterUserId: normalizedReporterUserId,
                targetType,
                targetId: normalizedTargetId,
              });

              Alert.alert(
                'Tak for din rapport',
                `Vi gennemgår din rapport manuelt. Ved akut behov kan du også kontakte ${SUPPORT_EMAIL}.`,
              );
            } catch (error: any) {
              logger.warn('[reporting] submitReport failed:', {
                targetType,
                targetId: normalizedTargetId,
                error,
              });
              Alert.alert(
                'Kunne ikke sende rapport',
                error?.message || 'Der opstod en fejl. Prøv igen om lidt.',
              );
            }
          })();
        },
      },
    ],
    { cancelable: true },
  );
}
