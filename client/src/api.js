const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

// Keep one deployment-aware base URL for every page. It must point at the
// Express API prefix (for example, https://api.example.com/api).
export const API_BASE = (configuredApiUrl || 'http://localhost:5000/api').replace(/\/$/, '');
export const SERVER_BASE = API_BASE.replace(/\/api$/, '');

export function apiUrl(path = '') {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

export function assetUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SERVER_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}
