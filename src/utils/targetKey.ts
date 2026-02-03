/**
 * Standardized target key generation for likes, comments, and previews
 */

export type TargetType = 'post' | 'news' | 'event' | 'match' | 'bus_trip';

/**
 * Generate a unique key for a target item
 * Used consistently across likeMap, commentCountMap, and commentPreviewMap
 */
export const targetKey = (type: TargetType, id: string): string => {
  return `${type}:${id}`;
};
