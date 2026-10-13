import Cookies from 'js-cookie';

export interface StoredProfile {
  id: string;
  name: string;
  role: 'admin' | 'user' | string;
  avatar?: string | null;
}

const PROFILE_COOKIE_KEY = 'active_profile';
const PROFILE_ID_KEY = 'active_profile_id';
const PROFILE_ROLE_KEY = 'active_profile_role';
const LOCAL_STORAGE_KEY = 'hamza_active_profile';

export function saveActiveProfile(profile: StoredProfile) {
  try {
    const jsonStr = JSON.stringify(profile);
    // Set cookie valid for 365 days
    Cookies.set(PROFILE_COOKIE_KEY, jsonStr, { expires: 365, path: '/' });
    Cookies.set(PROFILE_ID_KEY, profile.id, { expires: 365, path: '/' });
    Cookies.set(PROFILE_ROLE_KEY, profile.role, { expires: 365, path: '/' });

    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_KEY, jsonStr);
    }
  } catch (err) {
    console.error('Failed to save profile in storage:', err);
  }
}

export function getActiveProfile(): StoredProfile | null {
  try {
    // Try localStorage first (client)
    if (typeof window !== 'undefined') {
      const local = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (local) {
        try {
          return JSON.parse(local);
        } catch {}
      }
    }

    // Fallback to cookie
    const cookie = Cookies.get(PROFILE_COOKIE_KEY);
    if (cookie) {
      try {
        return JSON.parse(cookie);
      } catch {}
    }

    // Fallback to id & role cookies
    const id = Cookies.get(PROFILE_ID_KEY);
    const role = Cookies.get(PROFILE_ROLE_KEY);
    if (id && role) {
      return { id, role, name: 'User' };
    }
  } catch (err) {
    console.error('Failed to get active profile:', err);
  }
  return null;
}

export function clearActiveProfile() {
  try {
    Cookies.remove(PROFILE_COOKIE_KEY, { path: '/' });
    Cookies.remove(PROFILE_ID_KEY, { path: '/' });
    Cookies.remove(PROFILE_ROLE_KEY, { path: '/' });
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  } catch (err) {
    console.error('Failed to clear profile:', err);
  }
}
