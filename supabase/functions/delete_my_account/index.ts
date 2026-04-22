// deno-lint-ignore-file no-explicit-any
import {
  createAdminClient,
  json,
  requireAuthenticatedUser,
} from '../_shared/push.ts';

type StorageObjectRow = {
  bucket_id?: string | null;
  name?: string | null;
};

const STORAGE_QUERY_PAGE_SIZE = 1000;
const STORAGE_REMOVE_CHUNK_SIZE = 100;

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function listOwnedStorageObjects(adminClient: any, userId: string) {
  const rows: { bucketId: string; path: string }[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await adminClient
      .schema('storage')
      .from('objects')
      .select('bucket_id, name')
      .eq('owner', userId)
      .order('name', { ascending: true })
      .range(from, from + STORAGE_QUERY_PAGE_SIZE - 1);

    if (error) {
      throw error;
    }

    const page = Array.isArray(data) ? (data as StorageObjectRow[]) : [];

    for (const row of page) {
      const bucketId = readString(row.bucket_id);
      const path = readString(row.name);
      if (!bucketId || !path) continue;
      rows.push({ bucketId, path });
    }

    if (page.length < STORAGE_QUERY_PAGE_SIZE) {
      break;
    }

    from += STORAGE_QUERY_PAGE_SIZE;
  }

  return rows;
}

async function removeOwnedStorageObjects(
  adminClient: any,
  rows: { bucketId: string; path: string }[],
) {
  const pathsByBucket = new Map<string, string[]>();

  for (const row of rows) {
    const existing = pathsByBucket.get(row.bucketId) ?? [];
    existing.push(row.path);
    pathsByBucket.set(row.bucketId, existing);
  }

  for (const [bucketId, paths] of pathsByBucket.entries()) {
    for (const pathChunk of chunk(paths, STORAGE_REMOVE_CHUNK_SIZE)) {
      const { error } = await adminClient.storage.from(bucketId).remove(pathChunk);
      if (error) {
        throw error;
      }
    }
  }
}

Deno.serve(async (req) => {
  try {
    const auth = await requireAuthenticatedUser(req);
    if (auth.response) {
      return auth.response;
    }

    const userId = readString(auth.user.id);
    if (!userId) {
      return json(400, { error: 'Missing user id' });
    }

    const adminClient = createAdminClient();

    // Remove storage objects first. Supabase Auth deletion can fail while the
    // user still owns files in Storage.
    const ownedStorageObjects = await listOwnedStorageObjects(adminClient, userId);
    if (ownedStorageObjects.length > 0) {
      await removeOwnedStorageObjects(adminClient, ownedStorageObjects);
    }

    // Fan faction requests are the known FK blocker with ON DELETE RESTRICT.
    const { data: deletedRequests, error: requestDeleteError } = await adminClient
      .from('community_fan_faction_requests')
      .delete()
      .eq('requested_by', userId)
      .select('id');

    if (requestDeleteError) {
      throw requestDeleteError;
    }

    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId, false);
    if (deleteUserError) {
      return json(400, { error: deleteUserError.message });
    }

    return json(200, {
      ok: true,
      deletedUserId: userId,
      removedStorageObjectCount: ownedStorageObjects.length,
      removedFanFactionRequestCount: Array.isArray(deletedRequests) ? deletedRequests.length : 0,
    });
  } catch (error) {
    console.error('[delete_my_account] unexpected error', error);
    return json(500, {
      error: error instanceof Error ? error.message : 'Account deletion failed',
    });
  }
});
