import {SLIPSTREAM} from '@/ui/theme';

export const USER_PALETTE = [
  SLIPSTREAM.indigo,
  SLIPSTREAM.wash[1],
  SLIPSTREAM.wash[2],
  SLIPSTREAM.wash[3],
  SLIPSTREAM.success,
  SLIPSTREAM.warning,
  SLIPSTREAM.danger,
  SLIPSTREAM.ink,
  SLIPSTREAM.inkSecondary,
  SLIPSTREAM.indigoHover,
];

export const userColour = (userId: string) => {
  let hash = 2166136261;

  for (const char of userId) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  }

  return USER_PALETTE[hash % USER_PALETTE.length];
};
