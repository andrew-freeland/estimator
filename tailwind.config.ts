import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Stack compliance update: Tailwind CSS 4.1.14 configuration
      // Using @theme inline in globals.css for better performance
      colors: {
        background: "var(--color-background)",
        foreground: "var(--color-foreground)",
        brand: {
          charcoal: "#1D1E22",
          cream: "#F8F6F2",
          orange: "#F28C28",
          blue: "#2A6FE4",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
        heading: ["Chakra Petch", "sans-serif"],
        body: ["Space Grotesk", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
