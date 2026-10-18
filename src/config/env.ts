const getRequiredEnv = (name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_PUBLISHABLE_KEY') => {
  const value = import.meta.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const supabaseUrl = getRequiredEnv('VITE_SUPABASE_URL');

try {
  const url = new URL(supabaseUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
} catch {
  throw new Error('VITE_SUPABASE_URL must be a valid HTTP(S) URL.');
}

export const env = {
  supabaseUrl,
  supabasePublishableKey: getRequiredEnv('VITE_SUPABASE_PUBLISHABLE_KEY'),
} as const;
