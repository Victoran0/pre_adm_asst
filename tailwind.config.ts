import type { Config } from "tailwindcss";

/**
 * NHS Design System colour tokens.
 * Values taken from the NHS identity guidelines. Keep these authoritative —
 * do not introduce off-brand blues or greens elsewhere in the app.
 */
const config: Config = {
    content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
    theme: {
        extend: {
            colors: {
                nhs: {
                    blue: "#005EB8",       // primary brand
                    "dark-blue": "#003087",
                    "bright-blue": "#0072CE",
                    "light-blue": "#41B6E6",
                    "aqua-blue": "#00A9CE",
                    black: "#212B32",      // body text
                    "dark-grey": "#425563",
                    "mid-grey": "#768692",
                    "pale-grey": "#E8EDEE", // page background
                    white: "#FFFFFF",
                    green: "#007F3B",       // primary buttons
                    "green-dark": "#00401E",// button pressed shadow
                    red: "#D5281B",         // errors
                    yellow: "#FFEB3B",      // focus states
                },
            },
            fontFamily: {
                // NHS uses Frutiger (licensed); Arial is the official free fallback.
                nhs: ["Frutiger W01", "Arial", "Helvetica", "sans-serif"],
            },
        },
    },
    plugins: [],
};

export default config;