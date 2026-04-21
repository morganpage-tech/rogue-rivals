/** API is proxied to the game server in dev (`vite.config`); override with `VITE_API_BASE`. */
export const apiBase: string = import.meta.env.VITE_API_BASE ?? "";

export function apiUrl(path: string): string {
  return `${apiBase}${path}`;
}

export function wsUrl(path: string): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${path}`;
}
