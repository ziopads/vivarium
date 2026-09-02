import type { Item } from './types';

/**
 * Does this record still need work from the write-up task?
 *
 * The definition lived inline in Catalog.tsx's card marker. It is now read by
 * the card view and the list view both, so it lives here: two copies of the
 * same three-part condition is two copies to keep in step, and a marker that
 * means one thing in cards and another in the list is worse than no marker.
 *
 * True when the description is empty, OR the discussion is empty, OR the
 * discussion opens with the **Needs review** marker the write-up task leaves
 * when it could not confirm enough to write the deeper tier honestly.
 */
export function needsWriteup(item: Pick<Item, 'description' | 'discussion'>): boolean {
  const description = item.description?.trim();
  const discussion = item.discussion?.trim();
  return !description || !discussion || discussion.startsWith('**Needs review**');
}
