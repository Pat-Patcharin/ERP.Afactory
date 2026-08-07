import type { Config } from "tailwindcss";

/**
 * A-FACTORY ERP — Tailwind theme
 *
 * The design tokens live as CSS custom properties in app/globals.css so that
 * runtime theming stays possible. This file maps them onto Tailwind's scale so
 * components can use `bg-card`, `text-muted`, `rounded-card`, `shadow-md` etc.
 * and stay in the design system by construction.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "./schemas/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "var(--c-primary)",
          hover: "var(--c-primary-hover)",
          active: "var(--c-primary-active)",
          soft: "var(--c-primary-soft)",
          border: "var(--c-primary-border)",
        },
        /**
         * The document's own accent, which follows `data-doc-family`.
         *
         * Use these on anything that belongs to the PAPER — the rule under a
         * document header, table heads, the primary action on a document, a
         * document number. Use `primary` for anything that belongs to the
         * APPLICATION: the sidebar, the logo, the top bar. Getting the two
         * the wrong way round is what makes a recoloured module look like a
         * different product rather than a different job.
         */
        doc: {
          accent: "var(--c-doc-accent)",
          "accent-hover": "var(--c-doc-accent-hover)",
          "accent-soft": "var(--c-doc-accent-soft)",
          "accent-border": "var(--c-doc-accent-border)",
          head: "var(--c-doc-head)",
          "head-text": "var(--c-doc-head-text)",
        },
        surface: "var(--c-bg)",
        card: "var(--c-card)",
        sidebar: {
          DEFAULT: "var(--c-sidebar)",
          hover: "var(--c-sidebar-hover)",
          text: "var(--c-sidebar-text)",
          label: "var(--c-sidebar-label)",
        },
        line: {
          DEFAULT: "var(--c-border)",
          strong: "var(--c-border-strong)",
        },
        ink: {
          DEFAULT: "var(--c-text)",
          2: "var(--c-text-2)",
          3: "var(--c-text-3)",
        },
        success: {
          DEFAULT: "var(--c-success)",
          soft: "var(--c-success-soft)",
          text: "var(--c-success-text)",
        },
        warning: {
          DEFAULT: "var(--c-warning)",
          soft: "var(--c-warning-soft)",
          text: "var(--c-warning-text)",
        },
        danger: {
          DEFAULT: "var(--c-danger)",
          soft: "var(--c-danger-soft)",
          text: "var(--c-danger-text)",
        },
        info: {
          DEFAULT: "var(--c-info)",
          soft: "var(--c-info-soft)",
          text: "var(--c-info-text)",
        },
        neutral: {
          soft: "var(--c-neutral-soft)",
          text: "var(--c-neutral-text)",
        },
      },
      borderRadius: {
        card: "var(--r-card)",
        btn: "var(--r-btn)",
        input: "var(--r-input)",
        pill: "var(--r-pill)",
        sm: "var(--r-sm)",
      },
      boxShadow: {
        xs: "var(--sh-xs)",
        sm: "var(--sh-sm)",
        md: "var(--sh-md)",
        lg: "var(--sh-lg)",
        drawer: "var(--sh-drawer)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "Noto Sans Thai", "sans-serif"],
      },
      fontSize: {
        h1: ["28px", { lineHeight: "1.25", letterSpacing: "-0.02em" }],
        h2: ["24px", { lineHeight: "1.3", letterSpacing: "-0.015em" }],
        h3: ["18px", { lineHeight: "1.4", letterSpacing: "-0.01em" }],
        body: ["14px", { lineHeight: "1.5" }],
        cap: ["12px", { lineHeight: "1.5" }],
      },
      spacing: {
        sidebar: "var(--w-sidebar)",
        "sidebar-collapsed": "var(--w-sidebar-collapsed)",
        topbar: "var(--h-topbar)",
        drawer: "var(--w-drawer)",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(.16,1,.3,1)",
      },
      transitionDuration: {
        fast: "120ms",
        base: "200ms",
        slow: "320ms",
      },
      keyframes: {
        slideDown: {
          from: { opacity: "0", transform: "translateY(-6px)" },
          to: { opacity: "1", transform: "none" },
        },
        paneIn: {
          from: { opacity: "0", transform: "translateX(10px)" },
          to: { opacity: "1", transform: "none" },
        },
        toastIn: {
          from: { opacity: "0", transform: "translateX(24px)" },
          to: { opacity: "1", transform: "none" },
        },
        toastOut: { to: { opacity: "0", transform: "translateX(24px)" } },
        spinOnce: { to: { transform: "rotate(360deg)" } },
      },
      animation: {
        slideDown: "slideDown 200ms cubic-bezier(.16,1,.3,1)",
        paneIn: "paneIn 200ms cubic-bezier(.16,1,.3,1)",
        toastIn: "toastIn 320ms cubic-bezier(.16,1,.3,1)",
        toastOut: "toastOut 200ms forwards",
        spinOnce: "spinOnce 600ms cubic-bezier(.16,1,.3,1)",
      },
      zIndex: {
        drawer: "60",
        modal: "80",
        toast: "100",
      },
    },
  },
  plugins: [],
};

export default config;
