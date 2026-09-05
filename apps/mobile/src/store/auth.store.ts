import { create } from 'zustand';
import { User, UserPreferences, AuthSession, UpdatePreferencesDto } from '@talk-to-krisna/shared';
import { apiFetch, setApiAuthToken } from '../lib/api-client';

interface AuthState {
  user: User | null;
  profile: UserPreferences | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  login: (email: string, pass: string) => Promise<void>;
  register: (email: string, pass: string, displayName?: string, preferredName?: string) => Promise<void>;
  loginAnonymous: (preferredName?: string) => Promise<void>;
  updatePreferences: (dto: UpdatePreferencesDto) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  token: null,
  isLoading: false,
  error: null,

  initialize: async () => {
    // If token exists in memory or secure storage, verify session
    const { token } = get();
    if (!token) return;

    setApiAuthToken(token);
    try {
      const data: { user: User; profile: UserPreferences } = await apiFetch('/auth/me');
      set({ user: data.user, profile: data.profile, error: null });
    } catch {
      get().logout();
    }
  },

  login: async (email: string, pass: string) => {
    set({ isLoading: true, error: null });
    try {
      const session: AuthSession = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password: pass }),
      });
      setApiAuthToken(session.token);
      set({
        user: session.user,
        profile: session.profile || null,
        token: session.token,
        isLoading: false,
        error: null,
      });
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      throw err;
    }
  },

  register: async (email: string, pass: string, displayName?: string, preferredName?: string) => {
    set({ isLoading: true, error: null });
    try {
      const session: AuthSession = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password: pass, displayName, preferredName }),
      });
      setApiAuthToken(session.token);
      set({
        user: session.user,
        profile: session.profile || null,
        token: session.token,
        isLoading: false,
        error: null,
      });
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      throw err;
    }
  },

  loginAnonymous: async (preferredName?: string) => {
    set({ isLoading: true, error: null });
    try {
      const session: AuthSession = await apiFetch('/auth/anonymous', {
        method: 'POST',
        body: JSON.stringify({ preferredName }),
      });
      setApiAuthToken(session.token);
      set({
        user: session.user,
        profile: session.profile || null,
        token: session.token,
        isLoading: false,
        error: null,
      });
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      throw err;
    }
  },

  updatePreferences: async (dto: UpdatePreferencesDto) => {
    try {
      const updatedProfile: UserPreferences = await apiFetch('/user/preferences', {
        method: 'PATCH',
        body: JSON.stringify(dto),
      });
      set((state) => ({
        profile: updatedProfile,
        user: state.user && dto.preferredName ? { ...state.user, preferredName: dto.preferredName } : state.user,
      }));
    } catch (err: any) {
      set({ error: err.message });
      throw err;
    }
  },

  logout: () => {
    setApiAuthToken(null);
    set({ user: null, profile: null, token: null, error: null });
  },
}));
