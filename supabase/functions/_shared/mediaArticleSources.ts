export type MediaArticleSourceEndpoint = {
  url: string;
  kind: 'auto' | 'feed' | 'html';
  articlePathPrefixes?: string[];
  fromClubPage?: boolean;
};

export type MediaArticleSourceAdapter = {
  key: string;
  sourceName: string;
  allowedHosts: string[];
  endpoints: MediaArticleSourceEndpoint[];
};

// Source routes are deliberately data-driven. Publishers can move a feed or
// section page without requiring changes to the ingestion pipeline itself.
export const MEDIA_ARTICLE_SOURCES: readonly MediaArticleSourceAdapter[] = [
  {
    key: 'fcn',
    sourceName: 'FCN.dk',
    allowedHosts: ['fcn.dk'],
    endpoints: [
      {
        url: 'https://fcn.dk/nyheder/',
        kind: 'html',
        articlePathPrefixes: ['/nyheder/'],
        fromClubPage: true,
      },
    ],
  },
  {
    key: 'bold',
    sourceName: 'Bold.dk',
    allowedHosts: ['bold.dk'],
    endpoints: [
      {
        url: 'https://bold.dk/fodbold/klubber/fc-nordsjaelland',
        kind: 'html',
        articlePathPrefixes: ['/fodbold/nyheder/'],
        fromClubPage: true,
      },
    ],
  },
  {
    key: 'tipsbladet',
    sourceName: 'Tipsbladet',
    allowedHosts: ['tipsbladet.dk'],
    endpoints: [
      {
        url: 'https://www.tipsbladet.dk/nyhed/generelle/fc-nordsjaelland',
        kind: 'html',
        articlePathPrefixes: ['/nyhed/'],
      },
    ],
  },
  {
    key: 'campo',
    sourceName: 'Campo',
    allowedHosts: ['campo.dk'],
    endpoints: [
      { url: 'https://campo.dk/feed/', kind: 'feed' },
      {
        url: 'https://campo.dk/tag/fc-nordsjaelland/',
        kind: 'html',
        articlePathPrefixes: ['/20'],
        fromClubPage: true,
      },
    ],
  },
  {
    key: 'tv2-sport',
    sourceName: 'TV 2 Sport',
    allowedHosts: ['sport.tv2.dk', 'tv2.dk'],
    endpoints: [{ url: 'https://sport.tv2.dk/fodbold', kind: 'html' }],
  },
  {
    key: 'ekstra-bladet-sport',
    sourceName: 'Ekstra Bladet Sport',
    allowedHosts: ['ekstrabladet.dk'],
    endpoints: [
      {
        url: 'https://ekstrabladet.dk/sport/fodbold/dansk_fodbold/superligaen/',
        kind: 'html',
        articlePathPrefixes: ['/sport/'],
      },
    ],
  },
  {
    key: 'bt-sport',
    sourceName: 'B.T. Sport',
    allowedHosts: ['bt.dk'],
    endpoints: [{ url: 'https://www.bt.dk/sport', kind: 'html' }],
  },
  {
    key: 'dr-sporten',
    sourceName: 'DR Sporten',
    allowedHosts: ['dr.dk'],
    endpoints: [
      {
        url: 'https://www.dr.dk/sporten/fodbold/superliga',
        kind: 'html',
        articlePathPrefixes: ['/sporten/'],
      },
    ],
  },
  {
    key: 'alt-om-furesoe',
    sourceName: 'Alt om Furesø',
    allowedHosts: ['altomfuresoe.dk'],
    endpoints: [{ url: 'https://altomfuresoe.dk/', kind: 'html' }],
  },
  {
    key: 'sn-furesoe',
    sourceName: 'SN.dk',
    allowedHosts: ['sn.dk'],
    endpoints: [
      {
        url: 'https://www.sn.dk/furesoe-kommune/',
        kind: 'html',
        articlePathPrefixes: ['/furesoe-kommune/'],
      },
    ],
  },
] as const;
