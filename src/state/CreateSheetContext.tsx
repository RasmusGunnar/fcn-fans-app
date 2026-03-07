import React, { createContext, useContext, useMemo, useState } from 'react';

export type CreateSheetContentType = null | 'post' | 'news';

export type CreateSheetOpenOptions = {
  initialContentType?: CreateSheetContentType;
  initialFeedTargets?: string[];
  initialActor?: {
    type: 'user' | 'community';
    id: string;
    name: string;
  };
};

type CreateSheetContextValue = {
  visible: boolean;
  openCreateSheet: (options?: CreateSheetOpenOptions) => void;
  closeCreateSheet: () => void;
  initialContentType: CreateSheetContentType | undefined;
  initialFeedTargets: string[] | undefined;
  initialActor:
    | {
        type: 'user' | 'community';
        id: string;
        name: string;
      }
    | undefined;
};

const CreateSheetContext = createContext<CreateSheetContextValue | undefined>(undefined);

export function CreateSheetProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [initialContentType, setInitialContentType] = useState<
    CreateSheetContentType | undefined
  >(undefined);
  const [initialFeedTargets, setInitialFeedTargets] = useState<string[] | undefined>(undefined);
  const [initialActor, setInitialActor] = useState<
    | {
        type: 'user' | 'community';
        id: string;
        name: string;
      }
    | undefined
  >(undefined);

  const openCreateSheet = (options?: CreateSheetOpenOptions) => {
    setInitialContentType(options?.initialContentType);
    setInitialFeedTargets(options?.initialFeedTargets);
    setInitialActor(options?.initialActor);
    setVisible(true);
  };

  const closeCreateSheet = () => {
    setVisible(false);
    setInitialContentType(undefined);
    setInitialFeedTargets(undefined);
    setInitialActor(undefined);
  };

  const value = useMemo<CreateSheetContextValue>(
    () => ({
      visible,
      openCreateSheet,
      closeCreateSheet,
      initialContentType,
      initialFeedTargets,
      initialActor,
    }),
    [visible, initialContentType, initialFeedTargets, initialActor],
  );

  return <CreateSheetContext.Provider value={value}>{children}</CreateSheetContext.Provider>;
}

export function useCreateSheet() {
  const context = useContext(CreateSheetContext);
  if (!context) {
    throw new Error('useCreateSheet must be used within CreateSheetProvider');
  }
  return context;
}
