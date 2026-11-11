import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ZoomInOutlinedIcon from '@mui/icons-material/ZoomInOutlined';
import ZoomOutOutlinedIcon from '@mui/icons-material/ZoomOutOutlined';
import {Box, Button, IconButton, Stack, Tooltip, Typography} from '@/ui';
import type {ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {DEFAULT_ZOOM, ZOOM_LEVELS, stepZoom} from '@/utils/boardZoom';

export const CONTROL_HEIGHT = 34;

export const outlined = {
  bgcolor: 'background.paper',
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 999,
} as const;

/**
 * The retro's single band: the way back, the title, the presence and the dice, and the zoom
 * on the far right. A long title is cut with an ellipsis rather than wrapped, so the band
 * keeps one line on a phone, where the presence and the dice go to the line under it.
 */
export const RetroHeader = ({
  canZoom,
  dice,
  onZoomChange,
  presence,
  teamId,
  templateName,
  title,
  zoom,
}: {
  /** Nothing to scale on a board without columns. */
  canZoom: boolean;
  dice?: ReactNode;
  onZoomChange: (zoom: number) => void;
  presence: ReactNode;
  teamId: string;
  /** The template the retro was created from, as it was named then. */
  templateName?: string;
  title: string;
  zoom: number;
}) => (
  <Stack
    component="header"
    direction="row"
    sx={{alignItems: 'center', columnGap: {xs: 1, sm: 1.5}, flexWrap: 'wrap', rowGap: 1}}
  >
    <Tooltip title="Back to the team">
      <IconButton
        aria-label="Back to the team"
        component={Link}
        size="small"
        sx={{...outlined, flexShrink: 0, height: CONTROL_HEIGHT, width: CONTROL_HEIGHT}}
        to={`/teams/${teamId}`}
      >
        <ArrowBackRoundedIcon fontSize="small" />
      </IconButton>
    </Tooltip>

    <Typography
      component="h1"
      noWrap
      sx={{flex: '1 1 0', fontSize: {xs: '1.25rem', md: undefined}, minWidth: 0}}
      title={title}
      variant="headingL"
    >
      {title}
    </Typography>

    {templateName ? (
      <Typography
        color="textSecondary"
        noWrap
        sx={{display: {xs: 'none', sm: 'block'}, flexShrink: 1, maxWidth: 240, minWidth: 0}}
        title={`From template: ${templateName}`}
        variant="textS"
      >
        From template: {templateName}
      </Typography>
    ) : null}

    {/* Beside the title when there is room; on a phone it takes the line under the band. */}
    <Stack
      direction="row"
      sx={{
        alignItems: 'center',
        columnGap: 1.5,
        flexBasis: {xs: '100%', md: 'auto'},
        flexShrink: {xs: 0, md: 1},
        flexWrap: 'wrap',
        minWidth: 0,
        order: {xs: 1, md: 0},
        rowGap: 1,
      }}
    >
      <Box sx={{flexShrink: 0}}>{presence}</Box>
      {dice}
    </Stack>

    {canZoom ? (
      <Stack
        aria-label="Zoom"
        direction="row"
        role="group"
        sx={{...outlined, alignItems: 'center', flexShrink: 0, height: CONTROL_HEIGHT, px: 0.25}}
      >
        <Tooltip title="Zoom out">
          <span>
            <IconButton
              aria-label="Zoom out"
              disabled={zoom === ZOOM_LEVELS[0]}
              onClick={() => onZoomChange(stepZoom(zoom, -1))}
              size="small"
            >
              <ZoomOutOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Reset the zoom">
          <Button
            onClick={() => onZoomChange(DEFAULT_ZOOM)}
            size="small"
            sx={{fontVariantNumeric: 'tabular-nums', minHeight: 28, minWidth: 48, px: 0.5}}
            variant="text"
          >
            {Math.round(zoom * 100)}%
          </Button>
        </Tooltip>
        <Tooltip title="Zoom in">
          <span>
            <IconButton
              aria-label="Zoom in"
              disabled={zoom === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
              onClick={() => onZoomChange(stepZoom(zoom, 1))}
              size="small"
            >
              <ZoomInOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
    ) : null}
  </Stack>
);
