import React, { useEffect, useState } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
  Platform,
  Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';

export interface GoogleSignInUserInfo {
  id?: string;
  email?: string;
  name?: string;
  givenName?: string;
  familyName?: string;
  photo?: string;
}

interface GoogleSignInButtonProps {
  onSuccess: (idToken: string, user?: GoogleSignInUserInfo) => Promise<void>;
  onError: (error: string) => void;
  disabled?: boolean;
}

// Declare Google Identity Services global for Web
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: 'standard' | 'icon';
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: 'signin_with' | 'signup_with' | 'continue_with';
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              width?: number;
            }
          ) => void;
          prompt: (notification?: (notification: any) => void) => void;
        };
      };
    };
  }
}

// Dynamic require for native platforms to maintain full web bundling compatibility
let GoogleSignin: any = null;
let statusCodes: any = null;
let isErrorWithCode: any = null;

if (Platform.OS !== 'web') {
  try {
    const googleModule = require('@react-native-google-signin/google-signin');
    GoogleSignin = googleModule.GoogleSignin;
    statusCodes = googleModule.statusCodes;
    isErrorWithCode = googleModule.isErrorWithCode;
  } catch (e) {
    console.warn('[GoogleSignInButton] Failed to load @react-native-google-signin/google-signin', e);
  }
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  onSuccess,
  onError,
  disabled = false,
}) => {
  const [loading, setLoading] = useState(false);
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';

  useEffect(() => {
    // Native mobile: initialize GoogleSignin with configured Web Client ID
    if (Platform.OS !== 'web' && clientId && GoogleSignin) {
      try {
        GoogleSignin.configure({
          webClientId: clientId,
          offlineAccess: false,
        });
      } catch (err) {
        console.warn('[GoogleSignInButton] GoogleSignin.configure error:', err);
      }
    }

    // Only on Web: load Google Identity Services if client ID is provided
    if (Platform.OS === 'web' && typeof window !== 'undefined' && clientId) {
      const existingScript = document.getElementById('google-gsi-client');
      if (!existingScript) {
        const script = document.createElement('script');
        script.id = 'google-gsi-client';
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => {
          if (window.google?.accounts?.id) {
            window.google.accounts.id.initialize({
              client_id: clientId,
              callback: async (response) => {
                if (response.credential) {
                  setLoading(true);
                  try {
                    await onSuccess(response.credential);
                  } catch (err: any) {
                    onError(err.message || 'Google sign-in failed');
                  } finally {
                    setLoading(false);
                  }
                }
              },
            });
          }
        };
        document.head.appendChild(script);
      } else if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response) => {
            if (response.credential) {
              setLoading(true);
              try {
                await onSuccess(response.credential);
              } catch (err: any) {
                onError(err.message || 'Google sign-in failed');
              } finally {
                setLoading(false);
              }
            }
          },
        });
      }
    }
  }, [clientId]);

  const handlePress = async () => {
    if (loading || disabled) return;

    if (!clientId) {
      const msg =
        'Google Client ID is not configured. Please set EXPO_PUBLIC_GOOGLE_CLIENT_ID in apps/mobile/.env with your Google Cloud Console OAuth Client ID.';
      if (Platform.OS === 'web') {
        window.alert(msg);
      } else {
        Alert.alert('Configuration Required', msg);
      }
      onError(msg);
      return;
    }

    if (Platform.OS === 'web') {
      if (window.google?.accounts?.id) {
        window.google.accounts.id.prompt();
      } else {
        onError('Google Identity Services script is still loading. Please try again.');
      }
      return;
    }

    // Native mobile flow using Google Play Services
    if (!GoogleSignin) {
      onError('Google Sign-In native module is unavailable on this device.');
      return;
    }

    setLoading(true);
    let idToken: string | null = null;
    let googleUser: GoogleSignInUserInfo | undefined;

    try {
      // Re-configure before signing in to guarantee webClientId is active
      try {
        GoogleSignin.configure({
          webClientId: clientId,
          offlineAccess: false,
        });
      } catch (cErr) {
        console.warn('[GoogleSignInButton] Configure pre-signin warning:', cErr);
      }

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      const response = await GoogleSignin.signIn();

      if (response && response.type === 'cancelled') {
        return;
      }

      // Extract ID token across library version structures
      idToken =
        response && 'data' in response && response.data
          ? response.data.idToken
          : (response as any)?.idToken;

      // If idToken was not returned in response.data, attempt recovery via getTokens()
      if (!idToken) {
        try {
          const tokens = await GoogleSignin.getTokens();
          idToken = tokens?.idToken || null;
        } catch (tErr) {
          console.warn('[GoogleSignInButton] getTokens fallback error:', tErr);
        }
      }

      const rawUser =
        response && 'data' in response && response.data?.user
          ? response.data.user
          : (response as any)?.user;

      googleUser = rawUser
        ? {
            id: rawUser.id,
            email: rawUser.email,
            name: rawUser.name,
            givenName: rawUser.givenName,
            familyName: rawUser.familyName,
            photo: rawUser.photo,
          }
        : undefined;

      if (!idToken) {
        throw new Error('Google Sign-In completed, but no ID token was returned by Google Play Services.');
      }
    } catch (error: any) {
      if (isErrorWithCode && isErrorWithCode(error)) {
        if (error.code === statusCodes?.SIGN_IN_CANCELLED) {
          return;
        }
        if (error.code === statusCodes?.IN_PROGRESS) {
          return;
        }
        if (error.code === statusCodes?.PLAY_SERVICES_NOT_AVAILABLE) {
          onError('Google Play Services is not available or outdated on this device.');
          return;
        }
      }

      const errCode = (error as any)?.code;
      const errMsg = typeof error?.message === 'string' ? error.message : '';

      // Only treat as DEVELOPER_ERROR if errCode is explicitly 10 or message explicitly contains DEVELOPER_ERROR
      const isDevError =
        errCode === '10' ||
        errCode === 10 ||
        (Boolean(statusCodes?.DEVELOPER_ERROR) && errCode === statusCodes?.DEVELOPER_ERROR) ||
        errMsg.includes('DEVELOPER_ERROR');

      if (isDevError) {
        const errorDetail =
          'Google Sign-In requires an Android OAuth Client ID in Google Cloud Console:\n\n' +
          '• Project ID: 557211276662\n' +
          '• Package Name: com.talktokrishna.ai\n' +
          '• Release SHA-1 (APK): 60:DE:24:C0:E4:38:AB:5C:4A:39:3E:9B:69:E2:A0:F3:69:97:E9:F6\n' +
          '• Debug SHA-1: 5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25\n\n' +
          'Tap "Copy Release SHA-1" below and register it in Google Cloud Console > APIs & Services > Credentials > Create Credentials > OAuth client ID > Android.';
        Alert.alert('Google Sign-In Setup Required', errorDetail, [
          {
            text: 'Copy Release SHA-1 (APK)',
            onPress: async () => {
              try {
                await Clipboard.setStringAsync('60:DE:24:C0:E4:38:AB:5C:4A:39:3E:9B:69:E2:A0:F3:69:97:E9:F6');
                Alert.alert('Copied!', 'Release SHA-1 copied to clipboard. Paste this into Google Cloud Console.');
              } catch {}
            },
          },
          {
            text: 'Copy Debug SHA-1',
            onPress: async () => {
              try {
                await Clipboard.setStringAsync('5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25');
                Alert.alert('Copied!', 'Debug SHA-1 copied to clipboard.');
              } catch {}
            },
          },
          { text: 'Close', style: 'cancel' },
        ]);
        onError('Google Sign-In setup: Please register Release SHA-1 (60:DE:24:C0:E4...) in Google Cloud Console.');
        return;
      }

      console.error('[GoogleSignInButton] Native sign-in error:', error);
      onError(error.message || 'Google Sign-In failed.');
      return;
    } finally {
      if (!idToken) {
        setLoading(false);
      }
    }

    // Isolate backend session creation outside the Play Services catch block
    try {
      await onSuccess(idToken, googleUser);
    } catch (backendError: any) {
      console.error('[GoogleSignInButton] Backend authentication error:', backendError);
      onError(backendError.message || 'Failed to authenticate with server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.button, (disabled || loading) && styles.buttonDisabled]}
      onPress={handlePress}
      activeOpacity={0.85}
      disabled={disabled || loading}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color="#1E293B" style={styles.iconContainer} />
        ) : (
          <View style={styles.iconContainer}>
            <GoogleLogo size={20} />
          </View>
        )}
        <Text style={styles.buttonText}>
          {loading ? 'Connecting to Google...' : 'Continue with Google'}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

// Official styled Google 'G' Logo
function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#4285F4',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: '#FFFFFF',
          fontSize: size * 0.72,
          fontWeight: 'bold',
          lineHeight: size * 0.9,
          textAlign: 'center',
        }}
      >
        G
      </Text>
    </View>
  );
}


const styles = StyleSheet.create({
  button: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginRight: 12,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#1E293B',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
