import type { ExternalShareResourceType } from './externalShare';

export type RichInstagramResourceType = ExternalShareResourceType;

export type InstagramEmbedReady = {
  status: 'ready';
  canonicalUrl: string;
  resourceType: RichInstagramResourceType;
  html: string;
  authorName?: string;
  authorUrl?: string;
  thumbnailUrl?: string;
  fetchedAt: string;
  expiresAt: string;
  cached: boolean;
};

export type InstagramEmbedUnavailable = {
  status: 'unavailable';
  canonicalUrl: string;
  resourceType: RichInstagramResourceType;
  reason: 'private_or_unavailable' | 'temporarily_unavailable';
  retryAfter: string;
  cached: boolean;
};

export type InstagramEmbedResponse = InstagramEmbedReady | InstagramEmbedUnavailable;
