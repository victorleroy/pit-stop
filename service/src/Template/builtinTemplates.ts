/**
 * The classics every team can start from. They live in code, versioned with the app, never in
 * the database: nobody edits them, a team duplicates one to adapt it (ADR 0004 D2). The texts
 * are our own words.
 */
export interface BuiltinTemplate {
  columns: readonly {prompt: string; title: string}[];
  description: string;
  id: `builtin:${string}`;
  maxVotes: number | null;
  name: string;
  timerSeconds: number | null;
}

export const DEFAULT_TEMPLATE_ID = 'builtin:start-stop-continue';

export const BUILTIN_PREFIX = 'builtin:';

export const BUILTIN_TEMPLATES: readonly BuiltinTemplate[] = [
  {
    columns: [
      {prompt: 'Something we should try next sprint', title: 'Start'},
      {prompt: 'Something that costs us more than it gives', title: 'Stop'},
      {prompt: 'Something that works and must stay', title: 'Continue'},
    ],
    description: 'Three simple moves for the next sprint.',
    id: 'builtin:start-stop-continue',
    maxVotes: null,
    name: 'Start / Stop / Continue',
    timerSeconds: null,
  },
  {
    columns: [
      {prompt: 'What frustrated or blocked you', title: 'Mad'},
      {prompt: 'What disappointed you or could have gone better', title: 'Sad'},
      {prompt: 'What made you happy or proud', title: 'Glad'},
    ],
    description: 'Start from how the sprint felt, then find out why.',
    id: 'builtin:mad-sad-glad',
    maxVotes: null,
    name: 'Mad / Sad / Glad',
    timerSeconds: null,
  },
  {
    columns: [
      {prompt: 'What you enjoyed', title: 'Liked'},
      {prompt: 'What you discovered, technical or not', title: 'Learned'},
      {prompt: 'What was missing to do better', title: 'Lacked'},
      {prompt: 'What you wish had happened', title: 'Longed for'},
    ],
    description: 'Look back on the experience as a whole, not just the problems.',
    id: 'builtin:four-ls',
    maxVotes: null,
    name: '4L',
    timerSeconds: null,
  },
  {
    columns: [
      {prompt: 'What pushed us forward', title: 'Wind'},
      {prompt: 'What slowed us down', title: 'Anchors'},
      {prompt: 'Risks we can see coming', title: 'Rocks'},
      {prompt: 'The goal we are sailing to', title: 'Island'},
    ],
    description: 'One picture: the boat, the wind, the anchors and the rocks ahead.',
    id: 'builtin:sailboat',
    maxVotes: null,
    name: 'Sailboat',
    timerSeconds: null,
  },
  {
    columns: [
      {prompt: 'Valuable, keep as is', title: 'Keep doing'},
      {prompt: 'Good, worth doing more', title: 'More of'},
      {prompt: 'Useful, but overdone', title: 'Less of'},
      {prompt: 'No longer brings anything', title: 'Stop doing'},
      {prompt: 'New, worth trying', title: 'Start doing'},
    ],
    description: 'Five arms to adjust each habit finely rather than all or nothing.',
    id: 'builtin:starfish',
    maxVotes: null,
    name: 'Starfish',
    timerSeconds: null,
  },
  {
    columns: [
      {prompt: 'Keep exactly as is', title: 'Keep'},
      {prompt: 'A new practice to introduce', title: 'Add'},
      {prompt: 'Turn down', title: 'Less'},
      {prompt: 'Turn up', title: 'More'},
    ],
    description: 'Keep, Add, Less, More: fine-tune what is already there.',
    id: 'builtin:kalm',
    maxVotes: null,
    name: 'KALM',
    timerSeconds: null,
  },
  {
    columns: [
      {prompt: 'What we throw away', title: 'Drop'},
      {prompt: 'What we introduce', title: 'Add'},
      {prompt: 'What we protect', title: 'Keep'},
      {prompt: 'What we keep but fix', title: 'Improve'},
    ],
    description: 'Drop, Add, Keep, Improve: tidy up how the team works.',
    id: 'builtin:daki',
    maxVotes: null,
    name: 'DAKI',
    timerSeconds: null,
  },
  {
    columns: [
      {prompt: 'What lifts the team', title: 'Hot air'},
      {prompt: 'Dead weight we could drop', title: 'Sandbags'},
      {prompt: 'Threats on the horizon', title: 'Storms'},
      {prompt: 'Opportunities and good news ahead', title: 'Sunshine'},
    ],
    description: 'What lifts us, what weighs us down, and the weather ahead.',
    id: 'builtin:hot-air-balloon',
    maxVotes: null,
    name: 'Hot-air balloon',
    timerSeconds: null,
  },
  {
    columns: [
      {prompt: 'What went well', title: 'Plus'},
      {prompt: 'What we would change, phrased as a change', title: 'Delta'},
    ],
    description: 'The shortest format, for a quick retro.',
    id: 'builtin:plus-delta',
    maxVotes: null,
    name: 'Plus / Delta',
    timerSeconds: 600,
  },
  {
    columns: [
      {prompt: 'A highlight or success', title: 'Rose'},
      {prompt: 'An idea or promise that could grow', title: 'Bud'},
      {prompt: 'A pain point or obstacle', title: 'Thorn'},
    ],
    description: 'A success, a promise and a pain point each.',
    id: 'builtin:rose-bud-thorn',
    maxVotes: null,
    name: 'Rose / Bud / Thorn',
    timerSeconds: null,
  },
  {
    columns: [
      {prompt: 'What we would do again', title: 'What worked'},
      {prompt: 'Where we lost time', title: 'What got stuck'},
      {prompt: 'What to try next time', title: 'Ideas'},
      {prompt: 'Thank somebody, by name', title: 'Kudos'},
    ],
    description: 'End of project: results and thanks.',
    id: 'builtin:wrap-up-kudos',
    maxVotes: null,
    name: 'Wrap-up + kudos',
    timerSeconds: null,
  },
  {
    columns: [
      {prompt: 'Running smoothly, keep pushing', title: 'Green flag'},
      {prompt: 'Caution: a risk or slowdown to watch', title: 'Yellow flag'},
      {prompt: 'Must be fixed at this stop before the next stint', title: 'Box, box'},
      {prompt: 'A performance or a person to celebrate', title: 'Fastest lap'},
    ],
    description:
      'Our own motorsport format: read the flags, call the box, celebrate the fastest lap.',
    id: 'builtin:pit-stop',
    maxVotes: 3,
    name: 'Pit Stop',
    timerSeconds: null,
  },
  {
    columns: [],
    description: 'No column: lay out your own format on the board.',
    id: 'builtin:blank',
    maxVotes: null,
    name: 'Blank',
    timerSeconds: null,
  },
];

export const findBuiltinTemplate = (id: string): BuiltinTemplate | undefined =>
  BUILTIN_TEMPLATES.find((template) => template.id === id);
