export type ExternalShareProvider = 'instagram';

export type ExternalShareResourceType = 'post' | 'reel' | 'profile';

export type IncomingShareSource = 'ios_share_extension' | 'android_share_intent' | 'manual';

export type SharedLinkAttachment = {
  provider: ExternalShareProvider;
  canonicalUrl: string;
  displayUrl: string;
  resourceType: ExternalShareResourceType;
  externalId: string | null;
};

export type IncomingExternalShare = SharedLinkAttachment & {
  id: string;
  receivedAt: string;
  source: IncomingShareSource;
};

export type PersistedIncomingShare = {
  share: IncomingExternalShare;
  ownerUserId: string | null;
};

export type DatabaseExternalShare = {
  provider: ExternalShareProvider;
  canonical_url: string;
  display_url: string;
  resource_type: ExternalShareResourceType;
  external_id: string | null;
};
