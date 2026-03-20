export type FanLevelKey =
  | 'new_fan'
  | 'community_member'
  | 'regular_voice'
  | 'community_core'
  | 'dedicated'
  | 'top_fan';

export type FanLevelLabelMode = 'short' | 'full';

export interface FanLevelDefinition {
  key: FanLevelKey;
  level: number;
  name: string;
  fullLabel: string;
  shortLabel: string;
  description: string;
  minScore: number;
}
