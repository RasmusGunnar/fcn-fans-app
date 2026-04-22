import { supabase } from '../lib/supabase';

type DeleteMyAccountResponse = {
  ok?: boolean;
  error?: string;
  deletedUserId?: string;
  removedStorageObjectCount?: number;
  removedFanFactionRequestCount?: number;
};

export type DeleteMyAccountResult = {
  deletedUserId: string | null;
  removedStorageObjectCount: number;
  removedFanFactionRequestCount: number;
};

export async function deleteMyAccount(): Promise<DeleteMyAccountResult> {
  const { data, error } = await supabase.functions.invoke('delete_my_account');

  if (error) {
    throw new Error(error.message || 'Kunne ikke slette kontoen.');
  }

  const payload = (data ?? {}) as DeleteMyAccountResponse;
  if (payload.ok !== true) {
    throw new Error(payload.error || 'Kunne ikke slette kontoen.');
  }

  return {
    deletedUserId: typeof payload.deletedUserId === 'string' ? payload.deletedUserId : null,
    removedStorageObjectCount:
      typeof payload.removedStorageObjectCount === 'number' ? payload.removedStorageObjectCount : 0,
    removedFanFactionRequestCount:
      typeof payload.removedFanFactionRequestCount === 'number'
        ? payload.removedFanFactionRequestCount
        : 0,
  };
}
