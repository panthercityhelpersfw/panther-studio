/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        panel: {
          900: "#0b0d12",
          850: "#10131a",
          800: "#141821",
          750: "#1a1f2b",
          700: "#202634",
          650: "#28303f",
          600: "#323b4d",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          hover: "rgb(var(--accent-hover) / <alpha-value>)",
          dim: "rgb(var(--accent-dim) / <alpha-value>)",
        },
        panther: {
          gold: "#e8b341",
          red: "#ff5d6c",
          green: "#3ddc97",
          cyan: "#39d3e0",
        },
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
