export type EntryDisplay = {
  direction: 'DEBIT' | 'CREDIT';
  magnitudeMinor: string;
};

export const toEntryDisplay = (signedAmountMinor: string): EntryDisplay | null => {
  const signed = BigInt(signedAmountMinor);
  if (signed === 0n) return null;
  return {
    direction: signed > 0n ? 'DEBIT' : 'CREDIT',
    magnitudeMinor: (signed < 0n ? -signed : signed).toString(),
  };
};

export const entriesAreBalanced = (
  entries: ReadonlyArray<{ signed_amount_minor: string }>,
): boolean => {
  const amounts = entries.map((entry) => BigInt(entry.signed_amount_minor));
  return (
    amounts.length > 0 &&
    amounts.every((amount) => amount !== 0n) &&
    amounts.reduce((total, amount) => total + amount, 0n) === 0n
  );
};
