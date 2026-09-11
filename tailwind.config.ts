import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        field: "#241611",
        surface: "#31221A",
        surface2: "#3D2A20",
        line: "#5A4231",
        orange: "#F2691C",
        tan: "#D9A05B",
        ink: "#F5EDE4",
        mute: "#B49A85",
        loss: "#E5484D",
        win: "#3FB950",
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
