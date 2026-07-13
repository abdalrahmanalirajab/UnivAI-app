import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'light',
    background: {
      default: '#FAF7EF',
    },
    primary: {
      main: '#14213D',
      contrastText: '#FAF7EF',
    },
    secondary: {
      main: '#D9A94E',
      contrastText: '#14213D',
    },
    text: {
      primary: '#14213D',
      secondary: '#6B7280',
    },
    divider: '#E4DFD3',
    success: {
      main: '#2F6B33',
      light: '#DCEEDB',
    },
    warning: {
      main: '#8A6D1D',
      light: '#FBEBC7',
    },
    error: {
      main: '#9B2C2C',
      light: '#F7DCDC',
    },
    dark: {
      navy: '#0F1B2E',
      deep: '#0B0F14',
      border: '#24334D',
    },
  },
  typography: {
    fontFamily: '"Inter", sans-serif',
    h1: {
      fontFamily: '"Lora", serif',
      fontWeight: 600,
    },
    h2: {
      fontFamily: '"Lora", serif',
      fontWeight: 600,
    },
    h3: {
      fontFamily: '"Lora", serif',
      fontWeight: 600,
    },
    h4: {
      fontFamily: '"Lora", serif',
      fontWeight: 600,
    },
    overline: {
      fontFamily: '"IBM Plex Mono", monospace',
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      fontSize: '0.7rem',
      fontWeight: 500,
    },
  },
  shape: {
    borderRadius: 2,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 2,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontWeight: 600,
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          border: '1px solid #E4DFD3',
          boxShadow: 'none',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          border: '1px solid #E4DFD3',
          boxShadow: 'none',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 2,
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: '0.7rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: '0.7rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: '#6B7280',
          borderBottom: '1px solid #E4DFD3',
        },
      },
    },
  },
});

export default theme;
