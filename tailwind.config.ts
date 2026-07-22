import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        nasa: {
          DEFAULT: "#00e5ff",
          dim: "#00e5ff33",
          glow: "#00e5ff66",
        },
        esa: {
          DEFAULT: "#ff6d00",
          dim: "#ff6d0033",
          glow: "#ff6d0066",
        },
        void: "#030308",
        panel: "#0a0a12",
        "panel-border": "#1a1a2e",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "SF Mono", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "scan-line": "scanline 8s linear infinite",
        "glow-cyan": "glowCyan 2s ease-in-out infinite alternate",
        "glow-orange": "glowOrange 2s ease-in-out infinite alternate",
      },
      keyframes: {
        scanline: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        glowCyan: {
          "0%": { boxShadow: "0 0 5px #00e5ff33, 0 0 10px #00e5ff11" },
          "100%": { boxShadow: "0 0 15px #00e5ff66, 0 0 30px #00e5ff22" },
        },
        glowOrange: {
          "0%": { boxShadow: "0 0 5px #ff6d0033, 0 0 10px #ff6d0011" },
          "100%": { boxShadow: "0 0 15px #ff6d0066, 0 0 30px #ff6d0022" },
        },
      },
    },
  },
  plugins: [],
};

export default config;