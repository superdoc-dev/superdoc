import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: 13,
  },
  components: {
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          padding: '4px 8px',
          border: 'none',
          borderRadius: '6px !important',
          '&.Mui-selected': {
            backgroundColor: 'rgba(25, 118, 210, 0.12)',
          },
        },
        sizeSmall: {
          padding: '3px 6px',
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        sizeSmall: {
          padding: 4,
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          fontSize: 13,
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          margin: '0 4px',
        },
      },
    },
  },
});
