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
      'Please ensure your Android/iOS package (com.talktokrishna.ai) and SHA-1 fingerprint are registered in Google Cloud Console.'
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
