/**
 * localStorage can throw (private mode, blocked site data) or be missing entirely, so
 * every access goes through these two helpers and falls back to "not stored".
 */
export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Preference just won't persist; the app keeps working.
  }
}
