import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#161627",
        panel: "#FFFFFF",
        mist: "#F7F7FB",
        line: "#D9DCE8",
        indigo: "#4F46E5",
        emerald: "#10B981",
        amber: "#F59E0B",
        crimson: "#DC2626"
      },
      borderRadius: {
        ui: "8px"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"]
      }
    }
  },
  plugins: []
};

export default config;
