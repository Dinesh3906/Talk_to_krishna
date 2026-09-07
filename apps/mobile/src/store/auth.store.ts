import { create } from 'zustand';
import { User, UserPreferences, AuthSession, UpdatePreferencesDto, OtpPurpose } from '@talk-to-krisna/shared';
import { apiFetch, setApiAuthToken } from '../lib/api-client';

interface AuthState {
  user: User | null;
  profile: UserPreferences | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  login: (email: string, pass: string) => Promise<void>;
  signup: (
    email: string,
    pass: string,
    displayName?: string,
    preferredName?: string
  ) => Promise<{ message: string; email: string; isVerified: boolean }>;
  verifyOtp: (email: string, code: string, purpose?: OtpPurpose) => Promise<void>;
  forgotPassword: (email: string) => Promise<{ message: string }>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<{ message: string }>;
  resendOtp: (email: string, purpose?: OtpPurpose) => Promise<{ message: string }>;
  loginWithGoogle: (idToken: string) => Promise<void>;
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
        body: JSON.stringify({ email: email.trim().toLowerCase(), password: pass }),
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

  signup: async (email: string, pass: string, displayName?: string, preferredName?: string) => {
    set({ isLoading: true, error: null });
    const normalizedEmail = email.trim().toLowerCase();
    try {
      let result: { message: string; email: string; isVerified: boolean };
      try {
        result = await apiFetch('/auth/signup', {
          method: 'POST',
          body: JSON.stringify({
            email: normalizedEmail,
            password: pass,
            displayName,
            preferredName,
          }),
        });
      } catch (signupErr: any) {
        // If backend deployment doesn't yet have /auth/signup (returns 404), fall back to /auth/register
        if (signupErr.message?.includes('404')) {
          const session: AuthSession = await apiFetch('/auth/register', {
            method: 'POST',
            body: JSON.stringify({
              email: normalizedEmail,
              password: pass,
              displayName,
              preferredName,
            }),
          });
          setApiAuthToken(session.token);
          set({
            user: session.user,
            profile: session.profile || null,
            token: session.token,
            isLoading: false,
            error: null,
          });
          return {
            message: 'Account created successfully!',
            email: normalizedEmail,
            isVerified: true,
          };
        }
        throw signupErr;
      }
      set({ isLoading: false, error: null });
      return result;
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      throw err;
    }
  },

  verifyOtp: async (email: string, code: string, purpose: OtpPurpose = 'SIGNUP_VERIFICATION') => {
    set({ isLoading: true, error: null });
    try {
      const session: AuthSession = await apiFetch('/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code: code.trim(),
          purpose,
        }),
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

  forgotPassword: async (email: string) => {
    set({ isLoading: true, error: null });
    try {
      const result: { message: string } = await apiFetch('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      set({ isLoading: false, error: null });
      return result;
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      throw err;
    }
  },

  resetPassword: async (email: string, code: string, newPassword: string) => {
    set({ isLoading: true, error: null });
    try {
      const result: { message: string } = await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code: code.trim(),
          newPassword,
        }),
      });
      set({ isLoading: false, error: null });
      return result;
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      throw err;
    }
  },

  resendOtp: async (email: string, purpose: OtpPurpose = 'SIGNUP_VERIFICATION') => {
    try {
      const result: { message: string } = await apiFetch('/auth/resend-otp', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase(), purpose }),
      });
      return result;
    } catch (err: any) {
      throw err;
    }
  },

  loginWithGoogle: async (idToken: string) => {
    set({ isLoading: true, error: null });
    try {
      const session: AuthSession = await apiFetch('/auth/google', {
        method: 'POST',
        body: JSON.stringify({ idToken }),
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
        body: JSON.stringify({ email: email.trim().toLowerCase(), password: pass, displayName, preferredName }),
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
