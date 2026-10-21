"use client";

import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: "light",
    primary: { main: "#0d7a3e", dark: "#09592d", light: "#e3f1e7", contrastText: "#ffffff" },
    error: { main: "#d7261e", dark: "#a3160f", light: "#fde3e1", contrastText: "#ffffff" },
    warning: { main: "#ffd400", dark: "#6b5200", light: "#fff3bf", contrastText: "#13261a" },
    background: { default: "#f3f7f3", paper: "#ffffff" },
    text: { primary: "#13261a", secondary: "#4c5f52" },
    divider: "#dfe9e1",
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: "var(--font-rubik), system-ui, sans-serif",
    button: { textTransform: "none", fontWeight: 700 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
  },
});

export default theme;
