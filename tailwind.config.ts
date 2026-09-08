import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        field: "#0F1419",
        surface: "#171F27",
        surface2: "#1E2833",
        line: "#2B3641",
        gold: "#E8B44A",
        turf: "#4A7C6F",
        ink: "#F2F0EA",
        mute: "#8B94A0",
        loss: "#B4543A",
      },
      fontFamily: {
        display: ["var(--font-oswald)", "sans-serif"],
        body: ["var(--font-inter)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
