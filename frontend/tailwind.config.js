// Design tokens are defined ONCE here (colors map to CSS variables in index.css for light/dark).
const c = (name) => `rgb(var(--${name}) / <alpha-value>)`;
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    screens: { xs: "360px", sm: "640px", md: "768px", lg: "1024px", xl: "1280px", "2xl": "1536px" },
    extend: {
      colors: {
        primary: c("primary"), "on-primary": c("on-primary"), "primary-container": c("primary-container"),
        "on-primary-container": c("on-primary-container"),
        surface: c("surface"), "surface-container": c("surface-container"), "surface-high": c("surface-high"),
        "surface-variant": c("surface-variant"), "on-surface": c("on-surface"), "on-surface-variant": c("on-surface-variant"),
        outline: c("outline"), "outline-variant": c("outline-variant"), error: c("error"), "on-error": c("on-error"),
        critical: c("critical"), high: c("high"), medium: c("medium"), low: c("low"),
      },
      fontFamily: { sans: ['"Inter Variable"', "Inter", "system-ui", "sans-serif"] },
      fontWeight: { normal: "400", medium: "500", semibold: "600" }, // max 3 weights
      fontSize: {
        "display": ["2.25rem", { lineHeight: "2.75rem", fontWeight: "600", letterSpacing: "-0.01em" }],
        "headline": ["1.5rem", { lineHeight: "2rem", fontWeight: "600" }],
        "title": ["1rem", { lineHeight: "1.5rem", fontWeight: "600" }],
        "body": ["0.875rem", { lineHeight: "1.25rem", fontWeight: "400" }],
        "label": ["0.75rem", { lineHeight: "1rem", fontWeight: "500", letterSpacing: "0.02em" }],
      },
      borderRadius: { card: "16px", chip: "9999px" },
      boxShadow: {
        e0: "none",
        e1: "0 1px 2px rgb(0 0 0 / .10), 0 1px 3px 1px rgb(0 0 0 / .06)",
        e2: "0 1px 2px rgb(0 0 0 / .12), 0 2px 6px 2px rgb(0 0 0 / .08)",
        e3: "0 4px 8px 3px rgb(0 0 0 / .10), 0 1px 3px rgb(0 0 0 / .14)",
      },
      transitionTimingFunction: { standard: "cubic-bezier(0.2, 0, 0, 1)", decel: "cubic-bezier(0.05, 0.7, 0.1, 1)", accel: "cubic-bezier(0.3, 0, 0.8, 0.15)" },
      spacing: { gutter: "24px" },
    },
  },
  plugins: [],
};
