export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "forte:theme";
export const THEME_COOKIE = "forte_theme";
export const THEME_EVENT = "forte:theme-change";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === "light" || preference === "dark") return preference;
  return systemPrefersDark ? "dark" : "light";
}

export function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(stored)) return stored;
  } catch {
    // Storage may be unavailable in restricted contexts.
  }
  const match = document.cookie.match(/(?:^|;\s*)forte_theme=([^;]*)/);
  if (match && isThemePreference(match[1])) return match[1];
  return "system";
}

export function applyThemeToDocument(preference: ThemePreference): ResolvedTheme {
  const prefersDark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = resolveTheme(preference, prefersDark);
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.style.colorScheme = resolved;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", resolved === "dark" ? "#0d1512" : "#f4f7f4");
  }
  return resolved;
}

export function saveThemePreference(preference: ThemePreference): ResolvedTheme {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Continue with cookie + DOM application.
    }
    try {
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${THEME_COOKIE}=${preference}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    } catch {
      // Ignore cookie write failure in opaque origins.
    }
  }
  const resolved = applyThemeToDocument(preference);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { preference, resolved } }));
  }
  return resolved;
}

/**
 * Small inline script run in root layout before hydration so dark/light
 * resolves on the first frame with zero flash, including while offline.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_STORAGE_KEY}");if(p!=="system"&&p!=="light"&&p!=="dark"){var m=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=([^;]*)/);p=m&&(m[1]==="system"||m[1]==="light"||m[1]==="dark")?m[1]:"system";}var mq=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)");var apply=function(pref){var r=pref==="light"||pref==="dark"?pref:(mq&&mq.matches?"dark":"light");document.documentElement.dataset.theme=r;document.documentElement.dataset.themePreference=pref;document.documentElement.style.colorScheme=r;var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute("content",r==="dark"?"#0d1512":"#f4f7f4");};apply(p);if(mq&&mq.addEventListener){mq.addEventListener("change",function(){var cur=localStorage.getItem("${THEME_STORAGE_KEY}")||p;if(cur==="system")apply("system");});}}catch(e){}})();`;
