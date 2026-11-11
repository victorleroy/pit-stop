import CasinoOutlinedIcon from '@mui/icons-material/CasinoOutlined';
import {Button, Chip, Stack, Typography} from '@/ui';
import type {Participant} from '@/api/types';

/** The order drawn by the facilitator; everyone connected sees the same one. */
export const SpeakingOrder = ({
  canDraw,
  isBusy,
  onDraw,
  order,
}: {
  canDraw: boolean;
  isBusy: boolean;
  onDraw: () => void;
  order: Participant[];
}) => {
  if (!canDraw && order.length === 0) return null;

  return (
    <Stack direction="row" spacing={1} sx={{alignItems: 'center', flexWrap: 'wrap', rowGap: 1}}>
      {canDraw ? (
        <Button
          disabled={isBusy}
          onClick={onDraw}
          size="small"
          startIcon={<CasinoOutlinedIcon fontSize="small" />}
          variant="outlined"
        >
          {order.length ? 'Draw again' : 'Draw speaking order'}
        </Button>
      ) : null}

      {order.length ? (
        <>
          <Typography color="textSecondary" variant="textXs">
            Speaking order
          </Typography>
          <Stack
            aria-label="Speaking order"
            component="ol"
            direction="row"
            spacing={0.5}
            sx={{flexWrap: 'wrap', listStyle: 'none', m: 0, p: 0, rowGap: 0.5}}
          >
            {order.map((participant, index) => (
              <Chip
                component="li"
                key={participant.userId}
                label={`${index + 1}. ${participant.name}`}
                size="small"
              />
            ))}
          </Stack>
        </>
      ) : null}
    </Stack>
  );
};
