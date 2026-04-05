import { useState, useEffect, useCallback } from 'react';

export type CameraPermState = 'unknown' | 'granted' | 'denied' | 'prompt';

const STORAGE_KEY = 'camera_permission_granted';

export const useCameraPermission = () => {
  const [state, setState] = useState<CameraPermState>(() => {
    // Optimistic initial state from localStorage so the banner doesn't flash on already-granted devices
    return localStorage.getItem(STORAGE_KEY) === '1' ? 'granted' : 'unknown';
  });

  useEffect(() => {
    if (!navigator.permissions) return;
    navigator.permissions
      .query({ name: 'camera' as PermissionName })
      .then(result => {
        const s = result.state as CameraPermState;
        setState(s);
        if (s === 'granted') localStorage.setItem(STORAGE_KEY, '1');
        // React to future user changes in browser settings
        result.onchange = () => {
          const next = result.state as CameraPermState;
          setState(next);
          if (next === 'granted') localStorage.setItem(STORAGE_KEY, '1');
          else if (next === 'denied') localStorage.removeItem(STORAGE_KEY);
        };
      })
      .catch(() => {
        // Permissions API not available (older Safari); check localStorage
        if (localStorage.getItem(STORAGE_KEY) === '1') setState('granted');
        else setState('prompt');
      });
  }, []);

  /**
   * Request camera access — this opens the browser permission dialog once.
   * If the user clicks Allow, the browser will NEVER prompt again (on HTTPS).
   * The stream is immediately released after granting.
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      stream.getTracks().forEach(t => t.stop()); // release immediately — we just wanted the grant
      setState('granted');
      localStorage.setItem(STORAGE_KEY, '1');
      return true;
    } catch {
      setState('denied');
      localStorage.removeItem(STORAGE_KEY);
      return false;
    }
  }, []);

  return { state, requestPermission };
};
