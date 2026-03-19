declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
    EXPO_PUBLIC_FORCE_MATCHDAY_PREVIEW?: string;
  }
}

declare const process: {
  env: NodeJS.ProcessEnv;
};

export {};
