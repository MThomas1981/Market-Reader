import { useColorScheme } from 'react-native';

/** Same tokens as the web app (apps/web/app/globals.css). */
const light = {
  fog: '#eef1f4', paper: '#ffffff', ink: '#18222f', slate: '#5b6878', rule: '#d6dce3', ruleSoft: '#e7ebef',
  up: '#0b7a5c', upTint: '#e3f2ec', down: '#b83a2b', downTint: '#f8e7e4', accent: '#2f45c8', accentTint: '#e8ebfb',
};
const dark: typeof light = {
  fog: '#0f151d', paper: '#17202b', ink: '#e6ebf1', slate: '#98a5b4', rule: '#2b3746', ruleSoft: '#222c38',
  up: '#3fbf93', upTint: '#133229', down: '#ef7a68', downTint: '#3a1d19', accent: '#8d9dff', accentTint: '#1f2752',
};

export type Theme = typeof light;
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Serif for things you read (headlines, AI answers), like Newsreader on the web. */
export const serif = 'Georgia';
