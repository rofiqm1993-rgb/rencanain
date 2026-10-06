"use client";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, type User } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { userError } from "./user-errors";
export type FirebaseConfig = { apiKey: string; authDomain: string; projectId: string; storageBucket: string; messagingSenderId: string; appId: string };
export type ClientConfig = { firebase: FirebaseConfig | null; aiReady: boolean; model: string };
let currentConfig: FirebaseConfig | null = null;
export function configureFirebase(config: FirebaseConfig) {
  currentConfig = config;
  const app = getApps().find(a => a.name === "rencanain") || initializeApp(config, "rencanain");
  return getAuth(app);
}
export function firebaseAuth() { if (!currentConfig) throw new Error("Firebase belum dikonfigurasi."); return getAuth(getApps().find(a => a.name === "rencanain")!); }
export function firebaseDB() { return getFirestore(firebaseAuth().app); }
export async function authHeaders(user: User | null): Promise<Record<string, string>> { return user ? { Authorization: `Bearer ${await user.getIdToken()}` } : {}; }
export function authError(error: unknown) {
  return userError(error, "login");
}
