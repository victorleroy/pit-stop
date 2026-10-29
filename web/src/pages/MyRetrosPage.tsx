import {
  Chip,
  Loader,
  Stack,
  Typography,
} from '@/ui';
import {useQuery} from '@tanstack/react-query';
import {Link, useNavigate} from 'react-router-dom';
import {fetchMyRetros} from '@/api/retros';
import type {RetroPhase} from '@/api/types';
import {EmptyState} from '@/components/EmptyState';
import {TeamDot} from '@/components/TeamDot';
import {SURFACE} from '@/theme/texture';

const PHASE_LABELS: Record<RetroPhase, string> = {
  ARCHIVED: 'Archived',
  BRAINSTORM: 'Brainstorm',
  DISCUSS: 'Discuss',
  SHARE: 'Share',
  VOTE: 'Vote',
};

export const MyRetrosPage = () => {
  const navigate = useNavigate();

  const {data: retros, isLoading} = useQuery({
    queryFn: fetchMyRetros,
    queryKey: ['me', 'retros'],
    // A retro somebody else starts has to show up without a reload.
    refetchInterval: 10_000,
  });

  const live = (retros ?? []).filter(({phase}) => phase !== 'ARCHIVED');
  const archived = (retros ?? []).filter(({phase}) => phase === 'ARCHIVED');

  const section = (title: string, items: typeof live) =>
    items.length === 0 ? null : (
      <Stack spacing={2}>
        <Typography variant="headingS">
          {title}{' '}
          <Typography color="textSecondary" component="span" variant="textS">
            {items.length}
          </Typography>
        </Typography>

        <Stack spacing={1.5}>
          {items.map((retro) => (
            // A link rather than a clickable box: it takes the keyboard focus and opens in a
            // new tab like any other.
            <Stack
              component={Link}
              direction="row"
              key={retro.id}
              spacing={2}
              sx={{
                ...SURFACE,
                '&:focus-visible, &:hover': {borderColor: 'primary.main'},
                alignItems: 'center',
                color: 'inherit',
                flexWrap: 'wrap',
                px: 2.5,
                py: 2,
                textDecoration: 'none',
                transition: 'border-color 120ms ease',
              }}
              to={`/teams/${retro.teamId}/retros/${retro.id}`}
            >
              <TeamDot name={retro.teamName} />

              <Stack spacing={0.25} sx={{flex: '1 1 200px', minWidth: 0}}>
                <Typography variant="textL">{retro.title}</Typography>
                <Typography color="textSecondary" variant="textXs">
                  {retro.teamName}
                  {retro.createdAt
                    ? ` · ${new Date(retro.createdAt).toLocaleDateString('en-GB')}`
                    : ''}
                </Typography>
              </Stack>

              {/* The badges travel together: a long title wraps, they do not split. */}
              <Stack direction="row" spacing={1} sx={{alignItems: 'center', flexShrink: 0}} useFlexGap>
                {retro.isFacilitator ? (
                  <Chip label="You facilitate" size="small" variant="outlined" />
                ) : null}

                <Chip
                  color={retro.phase === 'ARCHIVED' ? 'default' : 'primary'}
                  label={PHASE_LABELS[retro.phase]}
                  size="small"
                  variant={retro.phase === 'ARCHIVED' ? 'outlined' : 'filled'}
                />
              </Stack>
            </Stack>
          ))}
        </Stack>
      </Stack>
    );

  return (
    <Stack spacing={4}>
      {isLoading ? (
        <Stack sx={{alignItems: 'center', py: 6}}>
          <Loader />
        </Stack>
      ) : null}

      {section('In progress', live)}
      {section('Archived', archived)}

      {!isLoading && (retros ?? []).length === 0 ? (
        <EmptyState
          action={{label: 'Browse teams', onClick: () => navigate('/teams')}}
          message="Join a team, and its retrospectives will show up here."
          title="No retro yet"
        />
      ) : null}
    </Stack>
  );
};
