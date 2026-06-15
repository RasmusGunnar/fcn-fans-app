import type { FeedItem } from '../types/feed';

function areShallowRecordsEqual(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): boolean {
  if (previous === next) {
    return true;
  }

  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);
  if (previousKeys.length !== nextKeys.length) {
    return false;
  }

  return previousKeys.every((key) => previous[key] === next[key]);
}

export function reconcileFeedItemIdentities(
  previousItems: FeedItem[],
  nextItems: FeedItem[],
): FeedItem[] {
  if (previousItems === nextItems) {
    return previousItems;
  }

  const previousByKey = new Map(
    previousItems.map((item) => [`${item.kind}:${item.id}`, item] as const),
  );
  const reconciledItems = nextItems.map((nextItem) => {
    const previousItem = previousByKey.get(`${nextItem.kind}:${nextItem.id}`);
    if (
      previousItem &&
      previousItem.kind === nextItem.kind &&
      areShallowRecordsEqual(
        previousItem.data as unknown as Record<string, unknown>,
        nextItem.data as unknown as Record<string, unknown>,
      )
    ) {
      return previousItem;
    }

    return nextItem;
  });

  const listIsUnchanged =
    previousItems.length === reconciledItems.length &&
    previousItems.every((item, index) => item === reconciledItems[index]);

  return listIsUnchanged ? previousItems : reconciledItems;
}
