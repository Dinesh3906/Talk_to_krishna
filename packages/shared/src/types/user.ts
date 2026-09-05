import { z } from 'zod';

export interface User {
  id: string;
  email?: string;
  displayName?: string;
  preferredName?: string;
  isAnonymous: boolean;
  createdAt: string;
  updatedAt?: string;
}

export type ReflectionDepth = 'concise' | 'balanced' | 'deep_philosophical';
export type MahabharataDensity = 'subtle' | 'contextual' | 'rich';
export type ThemePreference = 'dark' | 'light' | 'system';

export interface UserPreferences {
  userId: string;
  reflectionDepth: ReflectionDepth;
  mahabharataDensity: MahabharataDensity;
  themePreference: ThemePreference;
  enableLongTermMemory: boolean;
  preferredLanguage: string;
}

export interface UserMemory {
  id: string;
  userId: string;
  factKey: string;
  factValue: string;
  createdAt: string;
}

export const UpdatePreferencesSchema = z.object({
  preferredName: z.string().min(1).max(50).optional(),
  reflectionDepth: z.enum(['concise', 'balanced', 'deep_philosophical']).optional(),
  mahabharataDensity: z.enum(['subtle', 'contextual', 'rich']).optional(),
  themePreference: z.enum(['dark', 'light', 'system']).optional(),
  enableLongTermMemory: z.boolean().optional(),
  preferredLanguage: z.string().optional(),
});

export type UpdatePreferencesDto = z.infer<typeof UpdatePreferencesSchema>;
