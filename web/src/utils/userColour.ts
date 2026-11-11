export const USER_PALETTE = [
  '#635BFF',
  '#E5484D',
  '#0E9F6E',
  '#F76808',
  '#8E4EC6',
  '#0D9BB0',
  '#D6409F',
  '#3E63DD',
  '#B58105',
  '#2F9E44',
  '#C2410C',
  '#6E56CF',
];

export const userColour = (userId: string) => {
  let hash = 2166136261;

  for (const char of userId) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  }

  return USER_PALETTE[hash % USER_PALETTE.length];
};
