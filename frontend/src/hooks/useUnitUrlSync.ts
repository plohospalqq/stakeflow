import { useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { isUnit, type Unit } from '@/lib/units';
import { DEFAULT_UNIT, UNIT_PARAM, useUnitStore } from '@/stores/unit';

/**
 * Keeps ?u= in the URL and the unit store in agreement so shared links keep their unit.
 * Runs on navigation only: a ?u= in the URL (pasted link, back button) wins, and a URL
 * without one gets the current unit added. The default unit is left out to keep URLs clean.
 *
 * It deliberately does not re-run when the unit changes: the router commits navigations in
 * a transition while the store updates synchronously, so for one render they disagree and
 * a unit-triggered sync would undo the user's toggle. useSetUnit updates both instead.
 */
export function useUnitUrlSync(): void {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get(UNIT_PARAM);
    const { unit, setUnit } = useUnitStore.getState();
    if (isUnit(fromUrl)) {
      if (fromUrl !== unit) setUnit(fromUrl);
      return;
    }
    if (unit === DEFAULT_UNIT) return;
    params.set(UNIT_PARAM, unit);
    void navigate(
      { pathname: location.pathname, search: `?${params.toString()}`, hash: location.hash },
      { replace: true, preventScrollReset: true },
    );
  }, [location, navigate]);
}

/** Changes the unit and the URL in one go, so the sync effect never sees them disagree. */
export function useSetUnit(): (unit: Unit) => void {
  const location = useLocation();
  const navigate = useNavigate();
  const setUnit = useUnitStore((s) => s.setUnit);
  return useCallback(
    (unit: Unit) => {
      const params = new URLSearchParams(location.search);
      if (unit === DEFAULT_UNIT) params.delete(UNIT_PARAM);
      else params.set(UNIT_PARAM, unit);
      const search = params.toString();
      setUnit(unit);
      void navigate(
        { pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash },
        { replace: true, preventScrollReset: true },
      );
    },
    [location.pathname, location.search, location.hash, navigate, setUnit],
  );
}
