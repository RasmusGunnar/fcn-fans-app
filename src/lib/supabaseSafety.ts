import { DEMO_WRITE_BLOCK_MESSAGE } from '../config/appMode';

const TABLE_MUTATIONS = new Set(['insert', 'upsert', 'update', 'delete']);
const STORAGE_MUTATIONS = new Set([
  'upload',
  'update',
  'move',
  'copy',
  'remove',
  'createBucket',
  'updateBucket',
  'emptyBucket',
  'deleteBucket',
]);
const AUTH_MUTATIONS = new Set([
  'signInAnonymously',
  'signInWithIdToken',
  'signInWithOtp',
  'signInWithPassword',
  'signInWithSSO',
  'signInWithOAuth',
  'signUp',
  'signOut',
  'verifyOtp',
  'updateUser',
  'resetPasswordForEmail',
  'setSession',
  'refreshSession',
  'exchangeCodeForSession',
  'linkIdentity',
  'unlinkIdentity',
  'reauthenticate',
]);

export function blockedDemoMutation(operation: string): never {
  throw new Error(`${DEMO_WRITE_BLOCK_MESSAGE} (${operation})`);
}

function bindIfFunction(target: object, value: unknown): unknown {
  return typeof value === 'function' ? value.bind(target) : value;
}

function guardQueryBuilder<T extends object>(builder: T, table: string): T {
  return new Proxy(builder, {
    get(target, property, receiver) {
      const propertyName = String(property);
      if (TABLE_MUTATIONS.has(propertyName)) {
        return () => blockedDemoMutation(`table:${table}.${propertyName}`);
      }

      return bindIfFunction(target, Reflect.get(target, property, receiver));
    },
  });
}

function guardStorageBucket<T extends object>(bucket: T, bucketName: string): T {
  return new Proxy(bucket, {
    get(target, property, receiver) {
      const propertyName = String(property);
      if (STORAGE_MUTATIONS.has(propertyName)) {
        return () => blockedDemoMutation(`storage:${bucketName}.${propertyName}`);
      }

      return bindIfFunction(target, Reflect.get(target, property, receiver));
    },
  });
}

function guardStorage<T extends object>(storage: T): T {
  return new Proxy(storage, {
    get(target, property, receiver) {
      const propertyName = String(property);
      if (STORAGE_MUTATIONS.has(propertyName)) {
        return () => blockedDemoMutation(`storage.${propertyName}`);
      }

      if (propertyName === 'from') {
        return (bucketName: string) => {
          const from = Reflect.get(target, property, receiver) as (name: string) => object;
          return guardStorageBucket(from.call(target, bucketName), bucketName);
        };
      }

      return bindIfFunction(target, Reflect.get(target, property, receiver));
    },
  });
}

function guardAuth<T extends object>(auth: T): T {
  return new Proxy(auth, {
    get(target, property, receiver) {
      const propertyName = String(property);
      if (AUTH_MUTATIONS.has(propertyName)) {
        return () => blockedDemoMutation(`auth.${propertyName}`);
      }

      return bindIfFunction(target, Reflect.get(target, property, receiver));
    },
  });
}

function createOfflineChannel() {
  const channel = {
    on: () => channel,
    subscribe: (callback?: (status: string) => void) => {
      callback?.('CLOSED');
      return channel;
    },
    unsubscribe: async () => 'ok',
    send: () => blockedDemoMutation('realtime.send'),
    track: () => blockedDemoMutation('realtime.track'),
    untrack: () => blockedDemoMutation('realtime.untrack'),
  };

  return channel;
}

/**
 * Wrap the SDK client in Demo Mode. Reads remain available as a last-resort
 * compatibility path, while every known write surface is blocked centrally.
 * Realtime is replaced by an inert channel so demo flows stay offline.
 */
export function createDemoSafeSupabaseClient<T extends object>(client: T, demoEnabled: boolean): T {
  if (!demoEnabled) return client;

  return new Proxy(client, {
    get(target, property, receiver) {
      const propertyName = String(property);

      if (propertyName === 'from') {
        return (table: string) => {
          const from = Reflect.get(target, property, receiver) as (name: string) => object;
          return guardQueryBuilder(from.call(target, table), table);
        };
      }

      if (propertyName === 'schema') {
        return (schemaName: string) => {
          const schema = Reflect.get(target, property, receiver) as (name: string) => object;
          return createDemoSafeSupabaseClient(schema.call(target, schemaName), true);
        };
      }

      if (propertyName === 'rpc') {
        return (functionName: string) => blockedDemoMutation(`rpc:${functionName}`);
      }

      if (propertyName === 'functions') {
        return new Proxy(Reflect.get(target, property, receiver) as object, {
          get(_functionsTarget, functionProperty) {
            return () => blockedDemoMutation(`functions.${String(functionProperty)}`);
          },
        });
      }

      if (propertyName === 'storage') {
        return guardStorage(Reflect.get(target, property, receiver) as object);
      }

      if (propertyName === 'auth') {
        return guardAuth(Reflect.get(target, property, receiver) as object);
      }

      if (propertyName === 'channel') {
        return () => createOfflineChannel();
      }

      if (propertyName === 'removeChannel') {
        return async () => 'ok';
      }

      if (propertyName === 'removeAllChannels') {
        return async () => [];
      }

      return bindIfFunction(target, Reflect.get(target, property, receiver));
    },
  });
}
