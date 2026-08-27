import { useEffect, useState } from 'react';
import { fetchPlayers } from '../lib/api.js';

/**
 * The master player catalog, fetched once per session.
 *
 * Static reference data, so it does not belong in the auction reducer — it
 * never changes while a room is live.
 */
export function usePlayerCatalog() {
  const [players, setPlayers] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchPlayers()
      .then((list) => {
        if (!cancelled) setPlayers(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { players, error };
}
