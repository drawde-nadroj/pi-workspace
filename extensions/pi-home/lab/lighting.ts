export const MOODS = ["biolume", "kaleido", "sunlit"] as const;
export type Mood = typeof MOODS[number];
export const MOOD_NAMES: Record<Mood, string> = {
  biolume: "Bioluminescent", kaleido: "Kaleidoscopic", sunlit: "Sunlit",
};

/** Contained art palettes: selecting Sunlit does not change pi's global theme. */
export const GARDEN_COLORS: Record<Mood, Record<string, string>> = {
  biolume: {
    base: "#101c17", panel: "#192e23", input: "#223b2c", inset: "#14271d",
    text: "#e6eddf", muted: "#b7c8b3", faint: "#839b84", line: "#44644c",
    accent: "#c7bde7", secondary: "#bcdabb", glow: "#f0e8d7", success: "#bddbad", warning: "#e8cea5", error: "#e8b3bc",
    leafShade: "#2c5038", leaf: "#668969", leafLight: "#b2c99d", leafVein: "#ccd7b6", pot: "#ba9c90", bark: "#74624e",
    fur: "#e5c4a5", furLight: "#f3dfc1", furShade: "#ac8c72", ink: "#3a3439",
  },
  kaleido: {
    base: "#171124", panel: "#2b1f3d", input: "#3b2a4e", inset: "#21172f",
    text: "#fff0de", muted: "#d6b4d0", faint: "#a57da9", line: "#664377",
    accent: "#f1a3db", secondary: "#8cebc7", glow: "#fff2aa", success: "#c1ed97", warning: "#ffd585", error: "#ff9eae",
    leafShade: "#36516b", leaf: "#549c9b", leafLight: "#a1d578", leafVein: "#e4efac", pot: "#c58dbf",
  },
  sunlit: {
    base: "#f5eedc", panel: "#e7e7cf", input: "#dadfbf", inset: "#f0e7cc",
    text: "#344a3b", muted: "#5e7158", faint: "#858969", line: "#afb891",
    accent: "#8753a5", secondary: "#347d6b", glow: "#6c438e", success: "#4d773d", warning: "#98601f", error: "#aa405b",
    leafShade: "#37624e", leaf: "#548b56", leafLight: "#9eb85d", leafVein: "#c1cf7b", pot: "#b17666",
  },
};

export const SPECTRA: Record<Mood, string[]> = {
  biolume: ["#c7bde7", "#e4bdd1", "#ead0b8", "#dfddb3", "#bdd7b4", "#b6dcd0"],
  kaleido: ["#f286cf", "#f9b77c", "#e2e881", "#9aebba", "#84dcec", "#b09af8"],
  sunlit: ["#8953b3", "#bd5d88", "#b67a47", "#75882b", "#358b74", "#607ead"],
};
