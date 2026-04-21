/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Barlow', 'system-ui', 'sans-serif'],
                display: ['Barlow Semi Condensed', 'system-ui', 'sans-serif'],
            },
        },
    },
    plugins: [],
}
