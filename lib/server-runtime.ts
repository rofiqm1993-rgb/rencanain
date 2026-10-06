import { env } from "cloudflare:workers";
export type PublicConfig = { firebase: { apiKey: string; authDomain: string; projectId: string; storageBucket: string; messagingSenderId: string; appId: string } | null; aiReady: boolean; model: string };
export function runtimeValues() {
  const values = env as unknown as Record<string, string | undefined>;
  const firebase = { apiKey: values.FIREBASE_API_KEY || "", authDomain: values.FIREBASE_AUTH_DOMAIN || "", projectId: values.FIREBASE_PROJECT_ID || "", storageBucket: values.FIREBASE_STORAGE_BUCKET || "", messagingSenderId: values.FIREBASE_MESSAGING_SENDER_ID || "", appId: values.FIREBASE_APP_ID || "" };
  return { key: values.DEEPSEEK_API_KEY?.trim() || "", model: values.DEEPSEEK_MODEL?.trim() || "deepseek-flash", firebase: Object.values(firebase).every(v => v.trim()) ? firebase : null };
}
export function publicConfig(): PublicConfig { const v = runtimeValues(); return { firebase: v.firebase, aiReady: !!v.key, model: v.model }; }
