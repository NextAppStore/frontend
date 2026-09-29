import typography from '@tailwindcss/typography'

export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,ts,tsx,js,jsx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: "#317153",        // Hauptgrün
        primaryDark: "#336A4A",
        primaryLight: "#4e7d67",
        lightGreen: "#b9d4c0ff",
        ultraLightGreen: "#dbe5de" ,

        accentYellow: "#E48C2A",   // Gelb aus Logo
        lightYellow: "#fbe6cf",

        accentRed: "#e73501",      // Rot aus Logo
        lightRed: "#f8d6ccff",

        // ScholarStack-Rot, aus der Logo-PNG gemessen. Bewusst NEUE Tokens,
        // statt primary umzudefinieren: solange das Farbkonzept nicht
        // entschieden ist, bleibt der Rest der App unverändert grün.
        brandRed: "#E10210",
        brandRedDark: "#A30109",

        bgSoft: "#F4F7F5",
      },
    },
  },
  plugins: [typography],
}
