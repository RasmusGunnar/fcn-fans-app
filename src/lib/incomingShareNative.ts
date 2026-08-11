import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

type IncomingShareNativeModule = {
  getPendingShare: () => Promise<string | null>;
  consumePendingShare: (id: string) => Promise<boolean>;
  addListener?: (
    eventName: 'onIncomingShare',
    listener: (event: { payload?: string }) => void,
  ) => EventSubscription;
};

const nativeModule = requireOptionalNativeModule<IncomingShareNativeModule>('FCNIncomingShare');

export async function getPendingNativeShare(): Promise<string | null> {
  return nativeModule?.getPendingShare ? nativeModule.getPendingShare() : null;
}

export async function consumePendingNativeShare(id: string): Promise<void> {
  if (!nativeModule?.consumePendingShare) return;
  await nativeModule.consumePendingShare(id);
}

export function addIncomingNativeShareListener(
  listener: (payload: string) => void,
): EventSubscription | null {
  if (!nativeModule?.addListener) return null;
  return nativeModule.addListener('onIncomingShare', (event) => {
    if (typeof event.payload === 'string') listener(event.payload);
  });
}
