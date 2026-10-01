// The fixed disposition set (thesis 3.5.2, algorithm
// PrioritiseAndRecordAction; PRODUCT.md capabilities). A record names one
// of these five and nothing else: the action record is a defined
// disposition, not a general log (thesis 3.6).
//
// PENDING is deliberately absent. It is the absence of a record, not a
// stored value: a batch with no action is PENDING (thesis 3.6.8), and the
// label is derived at read time from whether an action exists.

export const DISPOSITIONS = [
  "REMOVED",
  "RETURNED",
  "SOLD",
  "DISCOUNTED",
  "DISPOSED",
] as const;

export type DispositionValue = (typeof DISPOSITIONS)[number];

export const DISPOSITION_LABELS: Record<DispositionValue, string> = {
  REMOVED: "Removed",
  RETURNED: "Returned",
  SOLD: "Sold",
  DISCOUNTED: "Discounted",
  DISPOSED: "Disposed",
};

/** Display name for a disposition value read back from the database. */
export function dispositionLabel(value: string): string {
  return DISPOSITION_LABELS[value as DispositionValue] ?? value;
}
