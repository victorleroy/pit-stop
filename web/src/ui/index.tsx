/**
 * The app's UI kit: MUI, plus the handful of components the product needs and MUI does not
 * ship. Pages import from here rather than from `@mui/material`, so a component can grow a
 * behaviour of its own without every page having to change.
 */
import Alert from '@mui/material/Alert';
import AppBar from '@mui/material/AppBar';
import MuiAvatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import CssBaseline from '@mui/material/CssBaseline';
import MuiDialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {ThemeProvider as MuiThemeProvider} from '@mui/material/styles';
import type {ChipProps} from '@mui/material/Chip';
import type {SxProps, Theme} from '@mui/material/styles';
import type {ReactNode} from 'react';
import {theme} from '@/ui/theme';

export {
  Alert,
  AppBar,
  Box,
  Button,
  Card,
  Chip,
  Container,
  IconButton,
  Paper,
  Select,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
};

export const Loader = ({size = 32}: {size?: number}) => <CircularProgress size={size} />;

const AVATAR_SIZES = {large: 48, medium: 40, small: 28} as const;

/** Sized by name rather than by box, because that is how the layouts talk about people. */
export const Avatar = ({
  children,
  size = 'medium',
  src,
  sx,
}: {
  children?: ReactNode;
  size?: keyof typeof AVATAR_SIZES;
  src?: string;
  sx?: SxProps<Theme>;
}) => {
  const box = AVATAR_SIZES[size];

  return (
    <MuiAvatar src={src} sx={{fontSize: Math.round(box * 0.4), height: box, width: box, ...sx}}>
      {children}
    </MuiAvatar>
  );
};

const DIALOG_WIDTHS = {large: 'md', medium: 'sm', small: 'xs'} as const;

/** Same idea for dialogs: a named size rather than a breakpoint. */
export const Dialog = ({
  children,
  onClose,
  open,
  size = 'medium',
}: {
  children: ReactNode;
  onClose: () => void;
  open: boolean;
  size?: keyof typeof DIALOG_WIDTHS;
}) => (
  <MuiDialog fullWidth maxWidth={DIALOG_WIDTHS[size]} onClose={onClose} open={open}>
    {children}
  </MuiDialog>
);

const NAMED_COLOURS: Record<string, string> = {
  muted: '#8792A2',
  primary: '#635BFF',
};

/**
 * A chip that paints itself from a colour rather than from a palette slot: teams take their
 * hue from the wash, and those hues are not theme colours.
 */
export const Tag = ({
  children,
  color,
  colour,
  size = 'small',
}: {
  children: ReactNode;
  color?: string;
  colour?: string;
  size?: ChipProps['size'];
}) => {
  const resolved = colour ?? (color ? (NAMED_COLOURS[color] ?? color) : undefined);

  return (
    <Chip
      label={children}
      size={size}
      sx={
        resolved
          ? {
              bgcolor: `${resolved}22`,
              border: '1px solid',
              borderColor: `${resolved}55`,
              color: 'text.primary',
              fontWeight: 600,
            }
          : {fontWeight: 600}
      }
    />
  );
};

export const ThemeProvider = ({children}: {children: ReactNode}) => (
  <MuiThemeProvider theme={theme}>
    <CssBaseline />
    {children}
  </MuiThemeProvider>
);
