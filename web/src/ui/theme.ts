import {createTheme} from '@mui/material/styles';

/**
 * Slipstream — Stripe's palette, Lovable's air.
 *
 * One indigo carries every action, a diffuse wash gives the room its light, and the paper
 * keeps doing the talking. The single rule that keeps it crisp rather than mushy: the
 * gradient is light, never a surface. Nothing readable sits on it and no button is one.
 */
export const SLIPSTREAM = {
  /** Every interactive thing, always solid. */
  indigo: '#635BFF',
  indigoHover: '#4B44D9',
  indigoTint: '#EFEEFF',

  ink: '#0A2540',
  inkSecondary: '#425466',
  inkMuted: '#8792A2',

  ground: '#F6F9FC',
  surface: '#FFFFFF',
  line: '#E3E8EE',

  success: '#0E9F6E',
  warning: '#D97706',
  danger: '#DF1B41',

  /** The wash, from the indigo it already uses out to a warm amber. */
  wash: ['#635BFF', '#8B5CF6', '#FF5C9D', '#FF7A45', '#FFC46B'],
} as const;

export const WASH_GRADIENT =
  'linear-gradient(90deg, #635BFF 0%, #8B5CF6 26%, #FF5C9D 58%, #FF7A45 82%, #FFC46B 100%)';

/** Soft and low, the Stripe way: you should notice the card, never the shadow. */
export const SOFT_SHADOW =
  '0 1px 2px rgba(10, 37, 64, 0.04), 0 16px 34px -20px rgba(10, 37, 64, 0.22)';

export const SOFT_SHADOW_RAISED =
  '0 2px 4px rgba(10, 37, 64, 0.06), 0 26px 48px -22px rgba(10, 37, 64, 0.3)';

const HEADING = '"Sora", ui-sans-serif, system-ui, sans-serif';
const BODY = '"Inter Tight", ui-sans-serif, system-ui, -apple-system, sans-serif';

/** The scale the app was written against, restated as plain MUI typography variants. */
const SCALE = {
  displayS: {
    fontFamily: HEADING,
    fontSize: '2.5rem',
    fontWeight: 800,
    letterSpacing: '-0.035em',
    lineHeight: 1.08,
  },
  headingL: {
    fontFamily: HEADING,
    fontSize: '1.75rem',
    fontWeight: 800,
    letterSpacing: '-0.03em',
    lineHeight: 1.18,
  },
  headingS: {
    fontFamily: HEADING,
    fontSize: '1.0625rem',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    lineHeight: 1.3,
  },
  text: {fontSize: '0.9375rem', fontWeight: 400, lineHeight: 1.55},
  textL: {fontSize: '1.0625rem', fontWeight: 400, lineHeight: 1.55},
  textM: {fontSize: '0.9375rem', fontWeight: 500, lineHeight: 1.5},
  textS: {fontSize: '0.875rem', fontWeight: 400, lineHeight: 1.5},
  textXs: {fontSize: '0.75rem', fontWeight: 400, lineHeight: 1.45},
} as const;

declare module '@mui/material/styles' {
  interface TypographyVariants {
    displayS: React.CSSProperties;
    headingL: React.CSSProperties;
    headingS: React.CSSProperties;
    text: React.CSSProperties;
    textL: React.CSSProperties;
    textM: React.CSSProperties;
    textS: React.CSSProperties;
    textXs: React.CSSProperties;
  }

  interface TypographyVariantsOptions {
    displayS?: React.CSSProperties;
    headingL?: React.CSSProperties;
    headingS?: React.CSSProperties;
    text?: React.CSSProperties;
    textL?: React.CSSProperties;
    textM?: React.CSSProperties;
    textS?: React.CSSProperties;
    textXs?: React.CSSProperties;
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    displayS: true;
    headingL: true;
    headingS: true;
    text: true;
    textL: true;
    textM: true;
    textS: true;
    textXs: true;
  }
}

export const theme = createTheme({
  components: {
    MuiButton: {
      defaultProps: {disableElevation: true},
      styleOverrides: {
        // Pills, and a touch target that clears 44px whatever the size prop says.
        root: {borderRadius: 999, fontWeight: 600, minHeight: 40, paddingInline: 20, textTransform: 'none'},
        contained: {
          boxShadow: '0 1px 2px rgba(10, 37, 64, 0.08), 0 8px 18px -8px rgba(99, 91, 255, 0.55)',
          '&:hover': {
            boxShadow: '0 1px 2px rgba(10, 37, 64, 0.1), 0 10px 22px -8px rgba(99, 91, 255, 0.6)',
          },
        },
        // The quiet ink outline is for ordinary actions: a destructive one keeps its red.
        outlined: ({ownerState}) =>
          ownerState.color === 'error' ? {} : {borderColor: SLIPSTREAM.line, color: SLIPSTREAM.ink},
        sizeSmall: {minHeight: 34, paddingInline: 14},
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: `1px solid ${SLIPSTREAM.line}`,
          borderRadius: 18,
          boxShadow: SOFT_SHADOW,
        },
      },
    },
    // MUI's label padding is sized for regular weight: in semibold the text grazes the edge.
    MuiChip: {
      styleOverrides: {
        label: {paddingInline: 14},
        labelSmall: {paddingInline: 10},
        root: {borderRadius: 999, fontWeight: 600},
      },
    },
    MuiDialog: {styleOverrides: {paper: {borderRadius: 22}}},
    MuiOutlinedInput: {
      styleOverrides: {
        root: {borderRadius: 12},
        notchedOutline: {borderColor: SLIPSTREAM.line},
      },
    },
    MuiPaper: {styleOverrides: {root: {backgroundImage: 'none'}}},
    MuiTextField: {defaultProps: {size: 'small'}},
    MuiTypography: {
      defaultProps: {
        variantMapping: {
          displayS: 'h1',
          headingL: 'h2',
          headingS: 'h3',
          text: 'p',
          textL: 'p',
          textM: 'p',
          textS: 'p',
          textXs: 'span',
        },
      },
    },
  },
  palette: {
    background: {default: SLIPSTREAM.ground, paper: SLIPSTREAM.surface},
    divider: SLIPSTREAM.line,
    error: {main: SLIPSTREAM.danger},
    primary: {dark: SLIPSTREAM.indigoHover, light: SLIPSTREAM.indigoTint, main: SLIPSTREAM.indigo},
    secondary: {main: SLIPSTREAM.ink},
    success: {main: SLIPSTREAM.success},
    text: {primary: SLIPSTREAM.ink, secondary: SLIPSTREAM.inkSecondary},
    warning: {main: SLIPSTREAM.warning},
  },
  shape: {borderRadius: 12},
  typography: {fontFamily: BODY, ...SCALE},
});
