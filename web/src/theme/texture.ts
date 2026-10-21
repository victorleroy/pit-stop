import {SLIPSTREAM, SOFT_SHADOW, SOFT_SHADOW_RAISED} from '@/ui/theme';

/**
 * The board should feel like paper in a lit room, not a spreadsheet. Everything here is
 * decoration: colour carries the column, never the author — an anonymous note must stay
 * anonymous.
 */

/** Cooled to sit on a blue-white ground; every pair clears 4.5:1. */
const NOTE_PALETTE = [
  {ink: '#4A3B00', paper: '#FFF3C4'},
  {ink: '#5A1F35', paper: '#FFD9E4'},
  {ink: '#0F2F4D', paper: '#D6E9FF'},
  {ink: '#0C4030', paper: '#D2F0E0'},
  {ink: '#2D2060', paper: '#E4DEFF'},
  {ink: '#4E2B0E', paper: '#FFE2CC'},
];

export const noteColours = (columnIndex: number) =>
  NOTE_PALETTE[columnIndex % NOTE_PALETTE.length];

export const PAPER_SHADOW =
  '0 1px 2px rgba(10, 37, 64, 0.06), 0 14px 26px -18px rgba(10, 37, 64, 0.55)';

export const PAPER_SHADOW_RAISED =
  '0 2px 4px rgba(10, 37, 64, 0.08), 0 22px 36px -20px rgba(10, 37, 64, 0.6)';

export {SOFT_SHADOW, SOFT_SHADOW_RAISED};

/**
 * The wash. Three very wide radial gradients rather than a grid: the room has light in it
 * instead of graph paper. It stays under 15% alpha because nothing readable may sit on it.
 */
export const BOARD_BACKGROUND = {
  backgroundAttachment: 'fixed',
  backgroundColor: SLIPSTREAM.ground,
  backgroundImage: [
    'radial-gradient(900px 420px at 12% 14%, rgba(99, 91, 255, 0.14), transparent 62%)',
    'radial-gradient(820px 380px at 88% 6%, rgba(255, 92, 157, 0.11), transparent 62%)',
    'radial-gradient(760px 420px at 70% 94%, rgba(255, 148, 69, 0.10), transparent 64%)',
  ].join(', '),
};

/** The same wash, wound tight, for the top edge of a card or the live phase. */
export const WASH_EDGE = {
  backgroundImage:
    'linear-gradient(90deg, #635BFF 0%, #8B5CF6 26%, #FF5C9D 58%, #FF7A45 82%, #FFC46B 100%)',
};

/**
 * Teams take their colour from the wash rather than from a palette of their own, so a team
 * is recognisable at a glance without a new hue entering the product. `tint` is the pale
 * gradient head of a card, `strong` the dot and the tag.
 */
const TEAM_COLOURS = [
  {strong: '#635BFF', tint: 'linear-gradient(120deg, rgba(99,91,255,0.20), rgba(139,92,246,0.10))'},
  {strong: '#FF5C9D', tint: 'linear-gradient(120deg, rgba(255,92,157,0.18), rgba(255,148,69,0.10))'},
  {strong: '#0E9F6E', tint: 'linear-gradient(120deg, rgba(14,159,110,0.18), rgba(99,91,255,0.10))'},
  {strong: '#8B5CF6', tint: 'linear-gradient(120deg, rgba(139,92,246,0.20), rgba(255,92,157,0.10))'},
  {strong: '#FF7A45', tint: 'linear-gradient(120deg, rgba(255,122,69,0.18), rgba(255,196,107,0.12))'},
  {strong: '#2E7CC4', tint: 'linear-gradient(120deg, rgba(46,124,196,0.18), rgba(99,91,255,0.10))'},
  {strong: '#C77A1E', tint: 'linear-gradient(120deg, rgba(199,122,30,0.16), rgba(255,196,107,0.12))'},
  {strong: '#0FA5B8', tint: 'linear-gradient(120deg, rgba(15,165,184,0.18), rgba(99,91,255,0.10))'},
  {strong: '#A0489A', tint: 'linear-gradient(120deg, rgba(160,72,154,0.18), rgba(255,92,157,0.10))'},
] as const;

export type TeamColour = (typeof TEAM_COLOURS)[number];

/**
 * A team keeps its colour from one screen to the next. Multiplying spreads names apart;
 * summing char codes lands neighbours on the same colour.
 */
export const teamColour = (key: string): TeamColour =>
  TEAM_COLOURS[
    [...key].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7) %
      TEAM_COLOURS.length
  ];

export const SURFACE = {
  bgcolor: 'rgba(255, 255, 255, 0.72)',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: '18px',
};

/**
 * Cursors have to read against paper and against the wash, so they get their own saturated
 * palette rather than the pastels of the notes.
 */
const CURSOR_PALETTE = ['#635BFF', '#FF5C9D', '#0E9F6E', '#FF7A45', '#8B5CF6', '#0FA5B8'];

export const cursorColour = (key: string) =>
  CURSOR_PALETTE[
    [...key].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7) %
      CURSOR_PALETTE.length
  ];
