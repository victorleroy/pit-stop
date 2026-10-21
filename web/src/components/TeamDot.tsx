import {Box} from '@/ui';
import {teamColour} from '@/theme/texture';

/**
 * The round mark that carries a team's colour. Same hue as the team's tag, read from one
 * table so a dot and a tag never drift apart.
 */
export const TeamDot = ({name, size = 10}: {name: string; size?: number}) => {
  return (
    <Box
      sx={{
        bgcolor: teamColour(name).strong,
        borderRadius: 999,
        flexShrink: 0,
        height: size,
        width: size,
      }}
    />
  );
};
