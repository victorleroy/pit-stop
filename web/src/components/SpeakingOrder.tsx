import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import {Box, IconButton, Stack, Tooltip} from '@/ui';
import type {DieRoll, Participant} from '@/api/types';
import {DieFace, RollingDie} from '@/components/DieFace';
import {speakingOrder} from '@/utils/speakingOrder';

const DIE_SIZE = 40;
const FACE_SIZE = 32;

const dieBox = {
  alignItems: 'center',
  borderRadius: '12px',
  display: 'inline-flex',
  height: DIE_SIZE,
  justifyContent: 'center',
  width: DIE_SIZE,
} as const;

/**
 * My die, big, beside the phase it belongs to: rolled once, it spins, shows my face for a
 * moment, then the face goes under my avatar in the presence, ranked. The order itself lives
 * in the presence; here only a check once it is complete and the facilitator's reset.
 */
export const SpeakingOrder = ({
  held,
  isBusy,
  isFacilitator,
  myUserId,
  onReset,
  onRoll,
  participants,
  rolls,
  spinningIds,
}: {
  /** My roll, between the end of its spin and its place in the order. */
  held?: DieRoll;
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
  const {isComplete, order, waiting} = speakingOrder(rolls, participants);
  const myRoll = held ?? order.find(({userId}) => userId === myUserId);
  const isMyTurnToRoll = !held && waiting.some(({userId}) => userId === myUserId);
  const isMineSpinning = Boolean(myUserId && spinningIds.includes(myUserId));

  return (
    // On a phone the track leaves room for the die alone: the check and the reset go under it.
    <Stack
      aria-label="Your die"
      direction={{xs: 'column', sm: 'row'}}
      role="group"
      sx={{alignItems: 'center', gap: {xs: 0.25, sm: 0.5}}}
    >
      {myRoll ? (
        <Tooltip title={`You rolled ${myRoll.value}`}>
          <Box
            aria-label={`You rolled ${myRoll.value}`}
            role="img"
            sx={{
              ...dieBox,
              opacity: held ? 1 : 0.55,
              transition: 'opacity 300ms ease',
              '@media (prefers-reduced-motion: reduce)': {transition: 'none'},
            }}
          >
            <DieFace highlight size={FACE_SIZE} value={myRoll.value} />
          </Box>
        </Tooltip>
      ) : isMyTurnToRoll ? (
        <Tooltip title={isMineSpinning ? 'Rolling…' : 'Roll your die'}>
          <span>
            <IconButton
              aria-label={isMineSpinning ? 'Rolling your die' : 'Roll your die'}
              disabled={isBusy || isMineSpinning}
              onClick={onRoll}
              sx={{
                ...dieBox,
                bgcolor: 'background.paper',
                border: '2px solid',
                borderColor: 'primary.main',
                boxShadow: ({palette}) => `0 0 0 4px ${palette.primary.light}`,
                p: 0,
                '&:hover, &.Mui-focusVisible': {bgcolor: 'primary.light'},
                '&.Mui-disabled': {bgcolor: 'background.paper', borderColor: 'primary.main'},
              }}
            >
              {isMineSpinning ? (
                <RollingDie highlight size={FACE_SIZE - 4} />
              ) : (
                <DieFace highlight isMystery size={FACE_SIZE - 4} />
              )}
            </IconButton>
          </span>
        </Tooltip>
      ) : null}

      <Stack direction="row" sx={{alignItems: 'center', gap: 0.25}}>
        {isComplete ? (
          <Tooltip title="Order complete">
            <Box aria-label="Order complete" role="img" sx={{color: 'success.main', display: 'inline-flex'}}>
              <CheckCircleRoundedIcon fontSize="small" />
            </Box>
          </Tooltip>
        ) : null}

        {isFacilitator && (rolls.length || spinningIds.length || held) ? (
          <Tooltip title="Reset the dice">
            <span>
              <IconButton
                aria-label="Reset the dice"
                disabled={isBusy}
                onClick={onReset}
                size="small"
                sx={{p: 0.25}}
              >
                <RestartAltRoundedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        ) : null}
      </Stack>
    </Stack>
  );
};
