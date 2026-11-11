import ButtonBase from '@mui/material/ButtonBase';
import {Button, Card, Chip, Stack, Typography} from '@/ui';
import type {DieRoll, Participant} from '@/api/types';
import {DieFace} from '@/components/DieFace';
import {speakingOrder} from '@/utils/speakingOrder';

const TILE_WIDTH = 76;

const Tile = ({children, label, rank}: {children: React.ReactNode; label: string; rank?: number}) => (
  <Stack component="li" spacing={0.5} sx={{alignItems: 'center', width: TILE_WIDTH}}>
    {children}
    <Typography
      sx={{maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}
      variant="textXs"
    >
      {rank ? <strong>{rank}. </strong> : null}
      {label}
    </Typography>
  </Stack>
);

/**
 * One die per person in the room: everybody rolls their own, and the order builds up as the
 * dice land, highest first. The service ranks them; ties were settled when they were rolled.
 */
export const SpeakingOrder = ({
  isBusy,
  isFacilitator,
  myUserId,
  onReset,
  onRoll,
  participants,
  rolls,
}: {
  isBusy: boolean;
  isFacilitator: boolean;
  myUserId?: string;
  onReset: () => void;
  onRoll: () => void;
  participants: Participant[];
  rolls: DieRoll[];
}) => {
  const {isComplete, order, waiting} = speakingOrder(rolls, participants);

  return (
    <Card component="section" aria-label="Speaking order" elevation={0} sx={{px: 2.5, py: 2}}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} sx={{alignItems: 'center', flexWrap: 'wrap', rowGap: 1}} useFlexGap>
          <Typography variant="headingS">Speaking order</Typography>
          {isComplete ? (
            <Chip color="success" label="Order complete" size="small" variant="outlined" />
          ) : (
            <Typography color="textSecondary" variant="textXs">
              {waiting.length
                ? `${waiting.length} still to roll · highest speaks first`
                : 'Roll your die · highest speaks first'}
            </Typography>
          )}
          {isFacilitator && rolls.length ? (
            <Button disabled={isBusy} onClick={onReset} size="small" sx={{ml: 'auto'}} variant="text">
              Reset the dice
            </Button>
          ) : null}
        </Stack>

        <Stack
          component="ol"
          direction="row"
          sx={{columnGap: 1, flexWrap: 'wrap', listStyle: 'none', m: 0, p: 0, rowGap: 1.5}}
        >
          {order.map((roll, index) => (
            <Tile key={roll.userId} label={roll.name} rank={index + 1}>
              <DieFace highlight={roll.userId === myUserId} size={40} value={roll.value} />
            </Tile>
          ))}

          {waiting.map((participant) =>
            participant.userId === myUserId ? (
              <Tile key={participant.userId} label="You">
                <ButtonBase
                  aria-label="Roll your die"
                  disabled={isBusy}
                  onClick={onRoll}
                  sx={{
                    '&:hover, &.Mui-focusVisible': {bgcolor: 'primary.light'},
                    border: '1.5px solid',
                    borderColor: 'primary.main',
                    borderRadius: '10px',
                    height: 40,
                    width: 40,
                  }}
                >
                  <DieFace highlight size={28} value={5} />
                </ButtonBase>
              </Tile>
            ) : (
              <Tile key={participant.userId} label={participant.name}>
                <DieFace size={40} />
              </Tile>
            ),
          )}
        </Stack>
      </Stack>
    </Card>
  );
};
