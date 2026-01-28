const STORAGE_KEY = 'last_protected_route';

// Страницы, которые не нужно запоминать
const EXCLUDED_PATHS = ['/', '/auth', '/help', '/docs'];

export function saveLastRoute(pathname: string, search: string) {
  if (EXCLUDED_PATHS.some(p => pathname === p || pathname.startsWith('/auth'))) {
    return;
  }
  const fullPath = pathname + search;
  try {
    localStorage.setItem(STORAGE_KEY, fullPath);
  } catch (e) {
    // localStorage may be unavailable in some contexts
    console.warn('Failed to save last route:', e);
  }
}

export function getLastRoute(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearLastRoute() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}
