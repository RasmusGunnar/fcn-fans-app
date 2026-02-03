// src/components/cards/cardBehaviorModel.ts
// ⚠️ PURE LOGIC - Må IKKE importere React eller React Native komponenter

export type CardKind = 'post' | 'news' | 'event';
export type ActorType = 'fan' | 'community';
export type PressBehavior = 'none' | 'open_external' | 'open_internal';

export type CardBehaviorInput = {
  kind: CardKind;

  // hvem poster/publisher/host?
  actorType: ActorType;
  actorName: string; // fanens navn eller community-navn (hvis man poster som community)

  // content targets
  postLinkUrl?: string | null;  // hvis post har indlejret link
  newsUrl?: string | null;      // nyhedens url
  eventId?: string | null;      // event detail target (intern)
  eventType?: string | null;

  // event: hvis tilknyttet community, skal navnelinje vise community-navn
  eventCommunityName?: string | null;
};

export type CardBehaviorModel = {
  categoryLabel: string;        // "Fra Fans" | "Nyhed" | "Event" | community navn
  nameLine?: string | null;     // fanens navn | community navn | null

  pressBehavior: PressBehavior; // none | open_external | open_internal
  externalUrl?: string;         // hvis open_external
  internalEventId?: string;     // hvis open_internal (event)
};

function safeText(value: string | null | undefined, fallback: string) {
  const v = (value ?? '').trim();
  return v.length ? v : fallback;
}

export function buildCardBehaviorModel(input: CardBehaviorInput): CardBehaviorModel {
  const actorName = safeText(input.actorName, input.actorType === 'fan' ? 'Ukendt fan' : 'Fællesskab');

  // Header rules (fra specifikationen)
  // - Post som fan: category="Fra Fans", nameLine=fanName
  // - Post som community: category=communityName, nameLine=null
  // - News: category="Nyhed", nameLine=actorName (fan eller community)
  // - Event: category="Event" | "Bustur", nameLine=null eller eventCommunityName hvis sat

  if (input.kind === 'post') {
    const categoryLabel = input.actorType === 'fan' ? 'Fra Fans' : actorName;
    const nameLine = input.actorType === 'fan' ? actorName : null;

    // Press rules:
    // - post med link => open_external
    // - ellers => none
    const url = (input.postLinkUrl ?? '').trim();
    if (url) {
      return { categoryLabel, nameLine, pressBehavior: 'open_external', externalUrl: url };
    }
    return { categoryLabel, nameLine, pressBehavior: 'none' };
  }

  if (input.kind === 'news') {
    const categoryLabel = 'Nyhed';
    const nameLine = actorName;
    const url = (input.newsUrl ?? '').trim();
    if (url) {
      return { categoryLabel, nameLine, pressBehavior: 'open_external', externalUrl: url };
    }
    // hvis url mangler: ingen tap (defensive)
    return { categoryLabel, nameLine, pressBehavior: 'none' };
  }

  // event
  {
    const eventType = (input.eventType ?? '').trim().toLowerCase();
    const categoryLabel = eventType === 'bustur' ? 'Bustur' : 'Event';
    const host = (input.eventCommunityName ?? '').trim();
    const nameLine = host ? host : null;

    const eventId = (input.eventId ?? '').trim();
    if (eventId) {
      return { categoryLabel, nameLine, pressBehavior: 'open_internal', internalEventId: eventId };
    }
    return { categoryLabel, nameLine, pressBehavior: 'none' };
  }
}
