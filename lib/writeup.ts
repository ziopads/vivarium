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
 *
 * `writeupDone` short-circuits it. /browse computes this server-side and sends
 * the boolean INSTEAD of the description and discussion text, which for the
 * written-up records is kilobytes of markdown per row whose only use in that
 * view is deciding whether to draw a small triangle.
 */
export function needsWriteup(
  item: Pick<Item, 'description' | 'discussion'> & { writeupDone?: boolean },
): boolean {
  if (typeof item.writeupDone === 'boolean') return !item.writeupDone;
  const description = item.description?.trim();
  const discussion = item.discussion?.trim();
  return !description || !discussion || discussion.startsWith('**Needs review**');
}
