export const darkTheme = {
  background: '#0B0F19',
  surface: '#121829',
  surfaceHover: '#1E2640',
  surfaceBorder: '#232D4B',
  primary: '#D4AF37', // Sacred Gold
  primaryLight: '#F3C74D',
  primaryMuted: 'rgba(212, 175, 55, 0.15)',
  secondary: '#14B8A6', // Peacock Teal
  secondaryMuted: 'rgba(20, 184, 166, 0.15)',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  accent: '#E2B86E',
  danger: '#EF4444',
  success: '#10B981',
  userBubble: '#1E293B',
  krishnaBubble: '#131D33',
  krishnaBorder: 'rgba(212, 175, 55, 0.25)',
  inputBackground: '#0F1523',
};

export const lightTheme = {
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceHover: '#F1F5F9',
  surfaceBorder: '#E2E8F0',
  primary: '#B8860B', // Darker Gold for light mode contrast
  primaryLight: '#D4AF37',
  primaryMuted: 'rgba(184, 134, 11, 0.1)',
  secondary: '#0D9488',
  secondaryMuted: 'rgba(13, 148, 136, 0.1)',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  accent: '#C59B27',
  danger: '#DC2626',
  success: '#059669',
  userBubble: '#E2E8F0',
  krishnaBubble: '#F1F5F9',
  krishnaBorder: 'rgba(184, 134, 11, 0.25)',
  inputBackground: '#FFFFFF',
};

export const typography = {
  fontFamilySerif: 'serif',
  fontFamilySans: 'System',
  sizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    display: 32,
  },
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};
