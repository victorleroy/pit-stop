export const moveColumn = (ids: string[], index: number, delta: -1 | 1): string[] => {
  const target = index + delta;

  if (target < 0 || target >= ids.length) return ids;

  const next = [...ids];
  [next[index], next[target]] = [next[target]!, next[index]!];

  return next;
};
