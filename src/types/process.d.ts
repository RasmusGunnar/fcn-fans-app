declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
    EXPO_PUBLIC_MATCHDAY_DEBUG?: string;
    EXPO_PUBLIC_FORCE_MATCHDAY_PREVIEW?: string;
    EXPO_PUBLIC_MATCHDAY_PREVIEW_MODE?: string;
    EXPO_PUBLIC_HOME_FEED_RANKING_DEBUG?: string;
    EXPO_PUBLIC_HOME_FEED_AUDIT_DEBUG?: string;
  }
}

declare const process: {
  env: NodeJS.ProcessEnv;
};

export {};
