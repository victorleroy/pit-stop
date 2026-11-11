import {Box, Card, Stack, Tooltip, Typography} from '@/ui';
import type {ActionStats, TrendPoint} from '@/api/types';

const percent = (rate: number) => `${Math.round(rate * 100)}%`;

const pointLabel = (point: TrendPoint) =>
  point.rate === null
    ? `${point.retroTitle}: nothing reviewed yet`
    : `${point.retroTitle}: ${point.done}/${point.done + point.dropped + point.kept} done, ${percent(point.rate)}`;

/** One bar per retro that reviewed its actions; the label carries what the colour shows. */
const Sparkline = ({points}: {points: TrendPoint[]}) => (
  <Stack spacing={0.5}>
    <Stack
      aria-label={`Completion rate over last ${points.length} retros: ${points
        .map(({rate}) => (rate === null ? 'none' : percent(rate)))
        .join(', ')}`}
      direction="row"
      role="img"
      spacing={0.5}
      sx={{alignItems: 'flex-end', height: 40}}
    >
      {points.map((point) => (
        <Tooltip key={point.retroId} title={`${pointLabel(point)}${point.current ? ' (in progress)' : ''}`}>
          <Box
            sx={{
              bgcolor: point.rate === null ? 'transparent' : 'success.main',
              border: 1,
              borderColor: point.current ? 'primary.main' : 'divider',
              borderRadius: 0.5,
              height: `${Math.max(8, (point.rate ?? 0) * 100)}%`,
              width: 14,
            }}
          />
        </Tooltip>
      ))}
    </Stack>
    {points.length < 2 ? (
      <Typography color="textSecondary" variant="textXs">
        Trend appears after two reviews
      </Typography>
    ) : null}
  </Stack>
);

/** Did the team do what it decided? Hidden until there is anything to say. */
export const FollowThrough = ({stats}: {stats?: ActionStats}) => {
  if (
    !stats ||
    (stats.completionTrend.length === 0 &&
      stats.doneSinceLastRetro === 0 &&
      stats.droppedSinceLastRetro === 0 &&
      stats.openCount === 0)
  ) {
    return null;
  }

  return (
    <Card sx={{p: 3}}>
      <Stack
        direction={{md: 'row', xs: 'column'}}
        spacing={3}
        sx={{alignItems: {md: 'center'}, justifyContent: 'space-between'}}
      >
        <Stack spacing={0.5}>
          <Typography variant="headingS">Follow-through</Typography>
          <Typography color="textSecondary" variant="textS">
            <strong>{stats.doneSinceLastRetro}</strong> done since last retro ·{' '}
            <strong>{stats.droppedSinceLastRetro}</strong> dropped · <strong>{stats.openCount}</strong>{' '}
            open
          </Typography>
        </Stack>
        <Sparkline points={stats.completionTrend} />
      </Stack>
    </Card>
  );
};
