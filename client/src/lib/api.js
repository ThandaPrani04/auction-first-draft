/**
 * HTTP calls to the server.
 *
 * ONE base URL, read from the environment. The old client hardcoded a Render
 * URL in four separate files while the socket pointed at localhost, so the two
 * halves of the app talked to two different servers and rooms created in one
 * did not exist in the other.
 */
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';

async function request(path, options = {}) {
  const res = await fetch(`${SERVER_URL}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(body.error || `Request failed (${res.status})`), {
      status: res.status,
      body,
    });
  }
  return body;
}

export const health = () => request('/health');

/** The master catalog in canonical order — the ledger's reference list. */
export const fetchPlayers = () => request('/players');

export const createRoom = (hostName) =>
  request('/rooms', { method: 'POST', body: JSON.stringify({ hostName }) });

/** Throws with status 404 if the room does not exist — callers must branch on it. */
export const checkRoom = (code) => request(`/rooms/${encodeURIComponent(code)}`);

export const fetchResults = (code) => request(`/rooms/${encodeURIComponent(code)}/results`);
