import {Button, Stack, Typography} from '@/ui';
import type {ReactNode} from 'react';

/**
 * One centred layout for everything that is not a board: errors, empty lists, dead ends.
 * An error should never be a red strip floating in the top-left corner.
 */
export const EmptyState = ({
  action,
  icon,
  message,
  title,
  tone = 'neutral',
}: {
  action?: {label: string; onClick: () => void};
  icon?: ReactNode;
  message?: string;
  title: string;
  tone?: 'error' | 'neutral';
}) => (
  <Stack
    spacing={2}
    sx={{
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 320,
      px: 3,
      textAlign: 'center',
    }}
  >
    <Stack
      sx={{
        alignItems: 'center',
        bgcolor: tone === 'error' ? 'error.light' : 'action.hover',
        borderRadius: '50%',
        color: tone === 'error' ? 'error.dark' : 'text.secondary',
        fontSize: 28,
        height: 64,
        justifyContent: 'center',
        width: 64,
      }}
    >
      {icon ?? (tone === 'error' ? '!' : '◌')}
    </Stack>

    <Typography variant="headingS">{title}</Typography>

    {message ? (
      <Typography color="textSecondary" sx={{maxWidth: 420}} variant="textS">
        {message}
      </Typography>
    ) : null}

    {action ? (
      <Button onClick={action.onClick} variant="contained">
        {action.label}
      </Button>
    ) : null}
  </Stack>
);
