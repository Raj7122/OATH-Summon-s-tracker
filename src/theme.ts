import { createTheme, alpha } from '@mui/material/styles';

/**
 * NYC OATH Summons Tracker - Premium MUI Theme
 *
 * Inspired by Egret React Admin Dashboard
 * Design Principles:
 * - Soft, diffuse shadows (not harsh black borders)
 * - Generous whitespace and padding
 * - Softer border radius (12-16px)
 * - Semantic color palette
 * - High contrast typography
 */

// Semantic Color Palette
const palette = {
  // Primary - Professional deep blue
  primary: {
    lighter: '#E3F2FD',
    light: '#64B5F6',
    main: '#1976D2',
    dark: '#1565C0',
    darker: '#0D47A1',
    contrastText: '#FFFFFF',
  },
  // Secondary - Elegant purple accent
  secondary: {
    lighter: '#EDE7F6',
    light: '#B39DDB',
    main: '#7C4DFF',
    dark: '#651FFF',
    darker: '#6200EA',
    contrastText: '#FFFFFF',
  },
  // Horizon System Colors - Critical/Approaching/Future
  error: {
    lighter: '#FFEBEE',
    light: '#EF9A9A',
    main: '#F44336',
    dark: '#D32F2F',
    darker: '#B71C1C',
    contrastText: '#FFFFFF',
  },
  warning: {
    lighter: '#FFF3E0',
    light: '#FFB74D',
    main: '#FF9800',
    dark: '#F57C00',
    darker: '#E65100',
    contrastText: 'rgba(0, 0, 0, 0.87)',
  },
  success: {
    lighter: '#E8F5E9',
    light: '#81C784',
    main: '#4CAF50',
    dark: '#388E3C',
    darker: '#1B5E20',
    contrastText: '#FFFFFF',
  },
  info: {
    lighter: '#E1F5FE',
    light: '#4FC3F7',
    main: '#03A9F4',
    dark: '#0288D1',
    darker: '#01579B',
    contrastText: '#FFFFFF',
  },
  // Neutral greys
  grey: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#EEEEEE',
    300: '#E0E0E0',
    400: '#BDBDBD',
    500: '#9E9E9E',
    600: '#757575',
    700: '#616161',
    800: '#424242',
    900: '#212121',
  },
  // Background - #F9FAFB for floating card effect
  background: {
    default: '#F9FAFB',
    paper: '#FFFFFF',
    neutral: '#F9FAFB',
  },
  // Text
  text: {
    primary: '#212B36',
    secondary: '#637381',
    disabled: '#919EAB',
  },
  // Divider
  divider: alpha('#919EAB', 0.24),
  // Action states
  action: {
    active: '#637381',
    hover: alpha('#919EAB', 0.08),
    selected: alpha('#919EAB', 0.16),
    disabled: alpha('#919EAB', 0.8),
    disabledBackground: alpha('#919EAB', 0.24),
    focus: alpha('#919EAB', 0.24),
  },
};

// Premium Shadow System - Soft, diffuse shadows
const shadows = [
  'none',
  '0px 2px 4px rgba(145, 158, 171, 0.08)',
  '0px 4px 8px rgba(145, 158, 171, 0.12)',
  '0px 8px 16px rgba(145, 158, 171, 0.12)',
  '0px 12px 24px rgba(145, 158, 171, 0.12)',
  '0px 16px 32px rgba(145, 158, 171, 0.12)',
  '0px 20px 40px rgba(145, 158, 171, 0.12)',
  '0px 24px 48px rgba(145, 158, 171, 0.12)',
  '0px 2px 4px rgba(145, 158, 171, 0.16)',
  '0px 4px 8px rgba(145, 158, 171, 0.16)',
  '0px 8px 16px rgba(145, 158, 171, 0.16)',
  '0px 12px 24px rgba(145, 158, 171, 0.16)',
  '0px 16px 32px rgba(145, 158, 171, 0.16)',
  '0px 20px 40px rgba(145, 158, 171, 0.16)',
  '0px 24px 48px rgba(145, 158, 171, 0.16)',
  '0px 2px 4px rgba(145, 158, 171, 0.20)',
  '0px 4px 8px rgba(145, 158, 171, 0.20)',
  '0px 8px 16px rgba(145, 158, 171, 0.20)',
  '0px 12px 24px rgba(145, 158, 171, 0.20)',
  '0px 16px 32px rgba(145, 158, 171, 0.20)',
  '0px 20px 40px rgba(145, 158, 171, 0.20)',
  '0px 24px 48px rgba(145, 158, 171, 0.20)',
  '0px 2px 4px rgba(145, 158, 171, 0.24)',
  '0px 4px 8px rgba(145, 158, 171, 0.24)',
  '0px 8px 16px rgba(145, 158, 171, 0.24)',
] as const;

// Create the premium theme
export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: palette.primary,
    secondary: palette.secondary,
    error: palette.error,
    warning: palette.warning,
    success: palette.success,
    info: palette.info,
    grey: palette.grey,
    background: palette.background,
    text: palette.text,
    divider: palette.divider,
    action: palette.action,
  },
  shadows: shadows as unknown as typeof createTheme extends (options: { shadows: infer S }) => unknown ? S : never,
  shape: {
    borderRadius: 12, // Softer, modern corners
  },
  typography: {
    fontFamily: [
      '"Public Sans"',
      'Inter',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
    // Display headings - High impact
    h1: {
      fontSize: '2.5rem',
      fontWeight: 700,
      lineHeight: 1.2,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 700,
      lineHeight: 1.3,
      letterSpacing: '-0.01em',
    },
    h3: {
      fontSize: '1.75rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 600,
      lineHeight: 1.5,
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 600,
      lineHeight: 1.5,
    },
    // Subtitles
    subtitle1: {
      fontSize: '1rem',
      fontWeight: 500,
      lineHeight: 1.5,
      letterSpacing: '0.01em',
    },
    subtitle2: {
      fontSize: '0.875rem',
      fontWeight: 600,
      lineHeight: 1.5,
      letterSpacing: '0.01em',
    },
    // Body text
    body1: {
      fontSize: '1rem',
      fontWeight: 400,
      lineHeight: 1.6,
      letterSpacing: '0.01em',
    },
    body2: {
      fontSize: '0.875rem',
      fontWeight: 400,
      lineHeight: 1.6,
      letterSpacing: '0.01em',
    },
    // Captions and overlines
    caption: {
      fontSize: '0.75rem',
      fontWeight: 400,
      lineHeight: 1.5,
      letterSpacing: '0.02em',
    },
    overline: {
      fontSize: '0.75rem',
      fontWeight: 700,
      lineHeight: 1.5,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
    },
    // Button text
    button: {
      fontSize: '0.875rem',
      fontWeight: 600,
      lineHeight: 1.75,
      letterSpacing: '0.02em',
      textTransform: 'none', // Modern - no uppercase
    },
  },
  components: {
    // CssBaseline - Global styles
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#F9FAFB',
        },
      },
    },
    // AppBar - Royal Blue Command Header
    MuiAppBar: {
      styleOverrides: {
        root: {
          background: `linear-gradient(135deg, ${palette.primary.main} 0%, ${palette.primary.dark} 100%)`,
          boxShadow: 'none',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          color: '#FFFFFF',
        },
      },
    },
    // Button - Premium flat style with hover shadows
    MuiButton: {
      defaultProps: {
        disableElevation: true, // Flat modern look
      },
      styleOverrides: {
        root: {
          borderRadius: 10,
          padding: '8px 20px',
          fontWeight: 600,
          transition: 'all 0.2s ease-in-out',
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)',
            transform: 'translateY(-1px)',
          },
        },
        outlined: {
          borderWidth: '1.5px',
          '&:hover': {
            borderWidth: '1.5px',
            backgroundColor: alpha(palette.primary.main, 0.04),
          },
        },
        text: {
          '&:hover': {
            backgroundColor: alpha(palette.primary.main, 0.08),
          },
        },
        sizeSmall: {
          padding: '6px 14px',
          fontSize: '0.8125rem',
        },
        sizeLarge: {
          padding: '12px 28px',
          fontSize: '1rem',
        },
      },
    },
    // Card - Premium elevation with soft shadows
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0px 4px 20px rgba(145, 158, 171, 0.08)',
          border: `1px solid ${alpha(palette.grey[500], 0.08)}`,
          transition: 'box-shadow 0.3s ease, transform 0.3s ease',
          '&:hover': {
            boxShadow: '0px 8px 28px rgba(145, 158, 171, 0.12)',
          },
        },
      },
    },
    // Paper - Consistent with Card styling
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none', // Remove default gradient
        },
        rounded: {
          borderRadius: 16,
        },
        elevation1: {
          boxShadow: '0px 2px 8px rgba(145, 158, 171, 0.08)',
        },
        elevation2: {
          boxShadow: '0px 4px 16px rgba(145, 158, 171, 0.10)',
        },
        elevation3: {
          boxShadow: '0px 8px 24px rgba(145, 158, 171, 0.12)',
        },
        elevation4: {
          boxShadow: '0px 12px 32px rgba(145, 158, 171, 0.14)',
        },
      },
    },
    // Chip - Soft/Alpha style (15% opacity background, 100% opacity text)
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 600,
          transition: 'all 0.2s ease',
          '&:hover': {
            transform: 'scale(1.02)',
          },
        },
        // Filled chips use soft alpha style by default
        filled: {
          '&.MuiChip-colorDefault': {
            backgroundColor: alpha(palette.grey[500], 0.15),
            color: palette.text.primary,
          },
          '&.MuiChip-colorPrimary': {
            backgroundColor: alpha(palette.primary.main, 0.15),
            color: palette.primary.dark,
          },
          '&.MuiChip-colorSecondary': {
            backgroundColor: alpha(palette.secondary.main, 0.15),
            color: palette.secondary.dark,
          },
          '&.MuiChip-colorError': {
            backgroundColor: alpha(palette.error.main, 0.15),
            color: palette.error.dark,
          },
          '&.MuiChip-colorWarning': {
            backgroundColor: alpha(palette.warning.main, 0.15),
            color: palette.warning.darker,
          },
          '&.MuiChip-colorSuccess': {
            backgroundColor: alpha(palette.success.main, 0.15),
            color: palette.success.dark,
          },
          '&.MuiChip-colorInfo': {
            backgroundColor: alpha(palette.info.main, 0.15),
            color: palette.info.dark,
          },
        },
        // Outlined chips also use soft alpha background
        outlined: {
          borderWidth: '1.5px',
          '&.MuiChip-colorDefault': {
            borderColor: alpha(palette.grey[500], 0.32),
            color: palette.text.primary,
            backgroundColor: alpha(palette.grey[500], 0.08),
          },
          '&.MuiChip-colorPrimary': {
            borderColor: alpha(palette.primary.main, 0.32),
            color: palette.primary.dark,
            backgroundColor: alpha(palette.primary.main, 0.08),
          },
          '&.MuiChip-colorError': {
            borderColor: alpha(palette.error.main, 0.32),
            color: palette.error.dark,
            backgroundColor: alpha(palette.error.main, 0.08),
          },
          '&.MuiChip-colorWarning': {
            borderColor: alpha(palette.warning.main, 0.32),
            color: palette.warning.darker,
            backgroundColor: alpha(palette.warning.main, 0.08),
          },
          '&.MuiChip-colorSuccess': {
            borderColor: alpha(palette.success.main, 0.32),
            color: palette.success.dark,
            backgroundColor: alpha(palette.success.main, 0.08),
          },
          '&.MuiChip-colorInfo': {
            borderColor: alpha(palette.info.main, 0.32),
            color: palette.info.dark,
            backgroundColor: alpha(palette.info.main, 0.08),
          },
        },
        clickable: {
          '&:hover': {
            boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.12)',
          },
        },
      },
    },
    // Alert - Softer styling
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          border: 'none',
        },
        standardInfo: {
          backgroundColor: alpha(palette.info.main, 0.12),
          color: palette.info.darker,
          '& .MuiAlert-icon': {
            color: palette.info.main,
          },
        },
        standardSuccess: {
          backgroundColor: alpha(palette.success.main, 0.12),
          color: palette.success.darker,
          '& .MuiAlert-icon': {
            color: palette.success.main,
          },
        },
        standardWarning: {
          backgroundColor: alpha(palette.warning.main, 0.12),
          color: palette.warning.darker,
          '& .MuiAlert-icon': {
            color: palette.warning.main,
          },
        },
        standardError: {
          backgroundColor: alpha(palette.error.main, 0.12),
          color: palette.error.darker,
          '& .MuiAlert-icon': {
            color: palette.error.main,
          },
        },
      },
    },
    // Drawer - Premium overlay
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRadius: '16px 0 0 16px',
          boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.08)',
        },
      },
    },
    // Dialog - Centered with premium shadow
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 16,
          boxShadow: '0px 24px 48px rgba(0, 0, 0, 0.16)',
        },
      },
    },
    // TextField - Clean input styling
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 10,
            transition: 'all 0.2s ease',
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: palette.primary.main,
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderWidth: '2px',
            },
          },
        },
      },
    },
    // Tooltip - Modern dark style
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: palette.grey[800],
          color: '#FFFFFF',
          fontSize: '0.75rem',
          fontWeight: 500,
          borderRadius: 8,
          padding: '8px 12px',
          boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.24)',
        },
        arrow: {
          color: palette.grey[800],
        },
      },
    },
    // IconButton - Subtle hover
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: alpha(palette.primary.main, 0.08),
          },
        },
      },
    },
    // Snackbar - Floating style
    MuiSnackbar: {
      styleOverrides: {
        root: {
          '& .MuiAlert-root': {
            boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.16)',
          },
        },
      },
    },
    // List - Clean spacing
    MuiListItem: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          marginBottom: 4,
          '&:hover': {
            backgroundColor: alpha(palette.primary.main, 0.04),
          },
        },
      },
    },
    // Divider - Subtle
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: palette.grey[200],
        },
      },
    },
    // Skeleton - For loading states
    MuiSkeleton: {
      styleOverrides: {
        root: {
          backgroundColor: palette.grey[200],
          borderRadius: 8,
        },
        rectangular: {
          borderRadius: 8,
        },
      },
    },
    // ToggleButton - For view toggles
    MuiToggleButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          textTransform: 'none',
          fontWeight: 600,
          transition: 'all 0.2s ease',
          '&.Mui-selected': {
            backgroundColor: palette.primary.main,
            color: palette.primary.contrastText,
            '&:hover': {
              backgroundColor: palette.primary.dark,
            },
          },
        },
      },
    },
    // Tabs - Underline style
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 3,
          borderRadius: '3px 3px 0 0',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '0.9rem',
          minHeight: 48,
        },
      },
    },
  },
});

// Export custom colors for direct use
export const horizonColors = {
  critical: palette.error.main,
  criticalLight: palette.error.lighter,
  approaching: palette.warning.main,
  approachingLight: palette.warning.lighter,
  future: palette.success.main,
  futureLight: palette.success.lighter,
  new: palette.info.main,
  newLight: palette.info.lighter,
};

// Premium DataGrid styling (applied via sx prop since MuiDataGrid is from @mui/x-data-grid)
export const dataGridPremiumStyles = {
  border: 'none',
  borderRadius: 3,
  '& .MuiDataGrid-main': {
    borderRadius: 3,
  },
  '& .MuiDataGrid-columnHeaders': {
    backgroundColor: palette.grey[50],
    borderBottom: `1px solid ${palette.grey[200]}`,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  '& .MuiDataGrid-columnHeader': {
    '&:focus, &:focus-within': {
      outline: 'none',
    },
  },
  '& .MuiDataGrid-columnHeaderTitle': {
    fontWeight: 600,
    color: palette.text.primary,
    fontSize: '0.875rem',
  },
  '& .MuiDataGrid-cell': {
    borderBottom: `1px solid ${palette.grey[100]}`,
    '&:focus, &:focus-within': {
      outline: 'none',
    },
  },
  '& .MuiDataGrid-row': {
    transition: 'background-color 0.2s ease',
    '&:hover': {
      backgroundColor: alpha(palette.primary.main, 0.04),
    },
    '&.Mui-selected': {
      backgroundColor: alpha(palette.primary.main, 0.08),
      '&:hover': {
        backgroundColor: alpha(palette.primary.main, 0.12),
      },
    },
  },
  '& .MuiDataGrid-footerContainer': {
    borderTop: `1px solid ${palette.grey[200]}`,
    backgroundColor: palette.grey[50],
  },
  // Remove vertical borders
  '& .MuiDataGrid-columnSeparator': {
    display: 'none',
  },
};

export default theme;
