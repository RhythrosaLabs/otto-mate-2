/**
 * Visual Themes System (Otto-inspired — 14+ switchable themes)
 *
 * Each theme defines CSS custom property overrides for the app.
 * Themes are applied by setting data-theme on <html> and
 * persisted to localStorage.
 */

export interface Theme {
  id: string;
  name: string;
  description: string;
  icon: string;
  colors: {
    bg: string;
    sidebar: string;
    card: string;
    border: string;
    text: string;
    muted: string;
    accent: string;
    accentHover?: string;
  };
  /** Optional category for grouping in the picker */
  category: "dark" | "light" | "colorful" | "special";
}

export const THEMES: Theme[] = [
  // ─── Dark Themes ────────────────────────────────────────────────────────────
  {
    id: "default",
    name: "Default",
    description: "The original Ottomatron dark theme",
    icon: "⬛",
    category: "dark",
    colors: {
      bg: "#0f0f10",
      sidebar: "#161618",
      card: "#1c1c1f",
      border: "#2a2a2e",
      text: "#e8e8ea",
      muted: "#8b8b94",
      accent: "#20b2aa",
    },
  },
  {
    id: "midnight",
    name: "Midnight",
    description: "Deep blue midnight tones",
    icon: "🌙",
    category: "dark",
    colors: {
      bg: "#0a0e1a",
      sidebar: "#0f1528",
      card: "#141c34",
      border: "#1e2a4a",
      text: "#e0e4f0",
      muted: "#7b84a0",
      accent: "#6366f1",
    },
  },
  {
    id: "matrix",
    name: "Matrix",
    description: "Green-on-black hacker aesthetic",
    icon: "🟢",
    category: "dark",
    colors: {
      bg: "#070a07",
      sidebar: "#0c100c",
      card: "#101510",
      border: "#1a251a",
      text: "#33ff33",
      muted: "#1a9e1a",
      accent: "#00ff41",
    },
  },
  {
    id: "aurora",
    name: "Aurora",
    description: "Northern lights color palette",
    icon: "🌌",
    category: "dark",
    colors: {
      bg: "#0c0f1a",
      sidebar: "#111425",
      card: "#161a30",
      border: "#252a48",
      text: "#e8ecf5",
      muted: "#8b92b0",
      accent: "#00d4aa",
    },
  },
  {
    id: "monochrome",
    name: "Monochrome",
    description: "Clean grayscale minimalism",
    icon: "⚫",
    category: "dark",
    colors: {
      bg: "#111111",
      sidebar: "#171717",
      card: "#1c1c1c",
      border: "#2e2e2e",
      text: "#e5e5e5",
      muted: "#888888",
      accent: "#ffffff",
    },
  },

  // ─── Colorful Themes ───────────────────────────────────────────────────────
  {
    id: "sunset",
    name: "Sunset",
    description: "Warm orange and pink sunset vibes",
    icon: "🌅",
    category: "colorful",
    colors: {
      bg: "#1a0e0e",
      sidebar: "#221414",
      card: "#2a1a1a",
      border: "#3a2525",
      text: "#f0e0d8",
      muted: "#a88880",
      accent: "#f97316",
    },
  },
  {
    id: "ocean",
    name: "Ocean",
    description: "Deep sea blue tones",
    icon: "🌊",
    category: "colorful",
    colors: {
      bg: "#091520",
      sidebar: "#0d1c2c",
      card: "#122438",
      border: "#1a3450",
      text: "#d8eaf5",
      muted: "#6b94b8",
      accent: "#0ea5e9",
    },
  },
  {
    id: "forest",
    name: "Forest",
    description: "Natural earth and green tones",
    icon: "🌲",
    category: "colorful",
    colors: {
      bg: "#0c1210",
      sidebar: "#101a16",
      card: "#15221c",
      border: "#203028",
      text: "#dae8e0",
      muted: "#7a9a88",
      accent: "#22c55e",
    },
  },
  {
    id: "cherry",
    name: "Cherry Blossom",
    description: "Soft pink Japanese aesthetic",
    icon: "🌸",
    category: "colorful",
    colors: {
      bg: "#180e14",
      sidebar: "#20141c",
      card: "#281a24",
      border: "#3a2530",
      text: "#f0dce6",
      muted: "#a07890",
      accent: "#ec4899",
    },
  },
  {
    id: "lavender",
    name: "Lavender",
    description: "Soothing purple lavender tones",
    icon: "💜",
    category: "colorful",
    colors: {
      bg: "#110e18",
      sidebar: "#181420",
      card: "#1e1a28",
      border: "#302838",
      text: "#e4dcea",
      muted: "#9080a8",
      accent: "#a855f7",
    },
  },
  {
    id: "neon",
    name: "Neon Nights",
    description: "Cyberpunk neon glow aesthetic",
    icon: "🔮",
    category: "colorful",
    colors: {
      bg: "#0a0a14",
      sidebar: "#0e0e1c",
      card: "#141424",
      border: "#1e1e38",
      text: "#f0e8ff",
      muted: "#8878b0",
      accent: "#e040fb",
    },
  },
  {
    id: "retro",
    name: "Retro Terminal",
    description: "Amber CRT terminal nostalgia",
    icon: "📺",
    category: "special",
    colors: {
      bg: "#0c0a04",
      sidebar: "#141008",
      card: "#1a1610",
      border: "#2a2418",
      text: "#ffb648",
      muted: "#8a7040",
      accent: "#ffa500",
    },
  },
  {
    id: "nordic",
    name: "Nordic",
    description: "Cool Scandinavian design",
    icon: "❄️",
    category: "dark",
    colors: {
      bg: "#2e3440",
      sidebar: "#3b4252",
      card: "#434c5e",
      border: "#4c566a",
      text: "#eceff4",
      muted: "#a0a8b8",
      accent: "#88c0d0",
    },
  },

  // ─── Light Theme ────────────────────────────────────────────────────────────
  {
    id: "light",
    name: "Light",
    description: "Clean, bright light theme",
    icon: "☀️",
    category: "light",
    colors: {
      bg: "#f8f9fa",
      sidebar: "#f0f1f3",
      card: "#ffffff",
      border: "#e2e4e8",
      text: "#1a1a2e",
      muted: "#6b7280",
      accent: "#0d9488",
    },
  },
];

// ─── Theme Application ───────────────────────────────────────────────────────

const THEME_STORAGE_KEY = "ottomatron_theme";

export function getStoredThemeId(): string {
  if (typeof window === "undefined") return "default";
  return localStorage.getItem(THEME_STORAGE_KEY) || "default";
}

export function getTheme(id: string): Theme {
  return THEMES.find(t => t.id === id) || THEMES[0];
}

export function applyTheme(themeId: string): void {
  const theme = getTheme(themeId);
  const root = document.documentElement;
  root.style.setProperty("--bg", theme.colors.bg);
  root.style.setProperty("--sidebar", theme.colors.sidebar);
  root.style.setProperty("--card", theme.colors.card);
  root.style.setProperty("--border", theme.colors.border);
  root.style.setProperty("--text", theme.colors.text);
  root.style.setProperty("--muted", theme.colors.muted);
  root.style.setProperty("--accent", theme.colors.accent);
  if (theme.colors.accentHover) {
    root.style.setProperty("--accent-hover", theme.colors.accentHover);
  }
  root.setAttribute("data-theme", themeId);
  localStorage.setItem(THEME_STORAGE_KEY, themeId);
}

export function initTheme(): void {
  if (typeof window === "undefined") return;
  const stored = getStoredThemeId();
  if (stored !== "default") {
    applyTheme(stored);
  }
}
