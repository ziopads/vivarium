'use client';

import EditableText from './EditableText';

type Vals = {
  condition: string;
  conditionNotes: string;
  location: string;
  notes: string;
  source: string;
  pricePaid: string;
};

// Fields that apply to every item type, plus private acquisition info.
// Every field persists when you leave it — there is no save-all to forget.
export default function DetailsEditor({ itemId, values }: { itemId: number; values: Vals }) {
  return (
    <div className="rounded-lg border border-line p-4">
      <p className="mb-3 text-sm font-medium">Details</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <EditableText
          itemId={itemId}
          field="condition"
          label="Condition"
          initial={values.condition}
          placeholder="Good / Fair / …"
        />
        <EditableText itemId={itemId} field="location" label="Location" initial={values.location} />
      </div>

      <div className="mt-3">
        <EditableText
          itemId={itemId}
          field="conditionNotes"
          label="Condition notes"
          initial={values.conditionNotes}
          textarea
        />
      </div>
      <div className="mt-3">
        <EditableText itemId={itemId} field="notes" label="Notes" initial={values.notes} textarea />
      </div>

      <p className="mb-2 mt-5 text-xs text-moss">🔒 Private — visible to admins only</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <EditableText
          itemId={itemId}
          field="source"
          label="Source"
          initial={values.source}
          placeholder="Where it came from"
        />
        <EditableText
          itemId={itemId}
          field="pricePaid"
          label="Price paid"
          initial={values.pricePaid}
          placeholder="e.g. $45"
        />
      </div>
    </div>
  );
}
