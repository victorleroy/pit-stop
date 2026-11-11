import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import {useState} from 'react';
import {Box, Chip, IconButton, Popover, Stack, Tooltip, Typography} from '@/ui';
import type {DieRoll, Participant} from '@/api/types';
import {DieFace, RollingDie} from '@/components/DieFace';
import {CONTROL_HEIGHT, outlined} from '@/components/RetroHeader';
import {speakingOrder} from '@/utils/speakingOrder';

export const VISIBLE_RANKS = 3;

/**
 * The dice in the retro band: my own die to roll, then the order as it builds up, highest
 * first. Only the first few ranks show; the rest of the order opens from `+n`. The service
 * ranks the rolls; a die still spinning is left out of the order until it settles.
 */
export const SpeakingOrder = ({
  isBusy,
  isFacilitator,
  myUserId,
  onReset,
  onRoll,
  participants,
  rolls,
  spinningIds,
}: {
  isBusy: boolean;
  isFacilitator: boolean;
  myUserId?: string;
  onReset: () => void;
  onRoll: () => void;
  participants: Participant[];
  /** The settled rolls only. */
  rolls: DieRoll[];
  spinningIds: string[];
}) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const {isComplete, order, waiting} = speakingOrder(rolls, participants);
  const spinning = new Set(spinningIds);
  const myRoll = order.find(({userId}) => userId === myUserId);
  const isMyTurnToRoll = waiting.some(({userId}) => userId === myUserId);
  const isMineSpinning = Boolean(myUserId && spinning.has(myUserId));
  const rollingOthers = waiting.filter(({userId}) => userId !== myUserId && spinning.has(userId));
  const stillToRoll = waiting.filter(({userId}) => !spinning.has(userId));
  const hiddenCount = order.length - VISIBLE_RANKS;

  return (
    <Stack
      aria-label="Speaking order"
      direction="row"
      role="group"
      sx={{alignItems: 'center', columnGap: 0.75, flexWrap: 'wrap', minWidth: 0, rowGap: 0.5}}
    >
      {myRoll ? (
        <Tooltip title={`You rolled ${myRoll.value}`}>
          <Box sx={{display: 'inline-flex', p: '6px'}}>
            <DieFace highlight size={22} value={myRoll.value} />
          </Box>
        </Tooltip>
      ) : isMyTurnToRoll ? (
        <Tooltip title={isMineSpinning ? 'Rolling…' : 'Roll your die · highest speaks first'}>
          <span>
            <IconButton
              aria-label={isMineSpinning ? 'Rolling your die' : 'Roll your die'}
              disabled={isBusy || isMineSpinning}
              onClick={onRoll}
              size="small"
              sx={{
                ...outlined,
                borderColor: 'primary.main',
                borderRadius: '10px',
                height: CONTROL_HEIGHT,
                width: CONTROL_HEIGHT,
                '&:hover, &.Mui-focusVisible': {bgcolor: 'primary.light'},
                '&.Mui-disabled': {bgcolor: 'background.paper', borderColor: 'divider'},
              }}
            >
              {isMineSpinning ? <RollingDie highlight size={22} /> : <DieFace highlight isMystery size={22} />}
            </IconButton>
          </span>
        </Tooltip>
      ) : null}

      {order.length ? (
        <Stack component="ol" direction="row" sx={{alignItems: 'center', gap: 0.5, listStyle: 'none', m: 0, p: 0}}>
          {order.slice(0, VISIBLE_RANKS).map((roll, index) => (
            <Tooltip key={roll.userId} title={`${roll.name} rolled ${roll.value}`}>
              <Chip
                color={roll.userId === myUserId ? 'primary' : 'default'}
                component="li"
                label={`${index + 1}. ${roll.name}`}
                size="small"
                sx={{maxWidth: 120}}
                variant="outlined"
              />
            </Tooltip>
          ))}
        </Stack>
      ) : null}

      {hiddenCount > 0 ? (
        <Chip
          aria-label="Show the full order"
          label={`+${hiddenCount}`}
          onClick={(event) => setAnchor(event.currentTarget)}
          size="small"
        />
      ) : null}

      {rollingOthers.map((participant) => (
        <Tooltip key={participant.userId} title={`${participant.name} is rolling…`}>
          <Box aria-label={`${participant.name} is rolling`} role="img" sx={{display: 'inline-flex'}}>
            <RollingDie size={18} />
          </Box>
        </Tooltip>
      ))}

      {isComplete ? (
        <Tooltip title="Order complete">
          <Box aria-label="Order complete" role="img" sx={{color: 'success.main', display: 'inline-flex'}}>
            <CheckCircleRoundedIcon fontSize="small" />
          </Box>
        </Tooltip>
      ) : null}

      {isFacilitator && (rolls.length || spinningIds.length) ? (
        <Tooltip title="Reset the dice">
          <span>
            <IconButton aria-label="Reset the dice" disabled={isBusy} onClick={onReset} size="small">
              <RestartAltRoundedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      ) : null}

      <Popover
        anchorEl={anchor}
        anchorOrigin={{horizontal: 'left', vertical: 'bottom'}}
        onClose={() => setAnchor(null)}
        open={Boolean(anchor)}
      >
        <Stack spacing={1} sx={{maxWidth: 280, px: 2, py: 1.5}}>
          <Typography variant="headingS">Speaking order</Typography>
          <Stack aria-label="Full speaking order" component="ol" spacing={0.5} sx={{m: 0, pl: 2.5}}>
            {order.map((roll) => (
              <Typography component="li" key={roll.userId} variant="textS">
                {roll.name} · {roll.value}
              </Typography>
            ))}
          </Stack>
          {stillToRoll.length ? (
            <Typography color="textSecondary" variant="textXs">
              Still to roll: {stillToRoll.map(({name}) => name).join(', ')}
            </Typography>
          ) : null}
        </Stack>
      </Popover>
    </Stack>
  );
};
