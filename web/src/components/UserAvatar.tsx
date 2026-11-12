import {Avatar} from '@/ui';
import type {AvatarSize} from '@/ui';
import type {SxProps, Theme} from '@mui/material/styles';
import {initials} from '@/utils/initials';
import {userColour} from '@/utils/userColour';

export type UserAvatarProps = ({id: string} | {userId: string}) & {
  /** The name is written next to the avatar: nothing left for a screen reader to add. */
  decorative?: boolean;
  name: string;
  pictureUrl?: string;
  size?: AvatarSize;
  sx?: SxProps<Theme>;
};

/**
 * One person looks the same everywhere. Notes, presence and member lists hand over whatever
 * identity they hold, with `id` or `userId`, so it can be spread as it comes.
 */
export const UserAvatar = (props: UserAvatarProps) => {
  const {decorative, name, pictureUrl, size, sx} = props;
  const userId = 'userId' in props ? props.userId : props.id;

  return (
    <Avatar
      alt={decorative ? '' : name}
      size={size}
      src={pictureUrl}
      sx={{bgcolor: userColour(userId), color: '#FFFFFF', ...sx}}
    >
      {initials(name)}
    </Avatar>
  );
};
