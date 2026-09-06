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
import Svg, { Path } from 'react-native-svg';

interface GoogleSignInButtonProps {
  onSuccess: (idToken: string) => Promise<void>;
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

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  onSuccess,
  onError,
  disabled = false,
}) => {
  const [loading, setLoading] = useState(false);
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';

  useEffect(() => {
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

    // Native mobile flow notification
    Alert.alert(
      'Google Sign-In',
      'Please ensure your Android/iOS package (com.talktokrishna.app) and SHA-1 fingerprint are registered in Google Cloud Console.'
    );
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

// Official Google 'G' Logo SVG
function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <Path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <Path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <Path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </Svg>
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
