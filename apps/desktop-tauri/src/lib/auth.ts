/**
 * Secure authentication module
 *
 * All authentication is handled by the Rust backend.
 * Tokens are stored in the OS keychain and never exposed to the frontend.
 */

import { invoke } from "@tauri-apps/api/core";

// ==========================================
// Types
// ==========================================

/**
 * Safe user info returned from backend (no tokens)
 */
export interface UserInfo {
  id: string;
  email: string;
  is_authenticated: boolean;
}

/**
 * Auth error from backend
 */
export interface AuthError {
  message: string;
  code?: string;
}

// ==========================================
// Auth Functions
// ==========================================

/**
 * Sign in with email and password
 * Authentication is handled securely by the Rust backend
 */
export async function login(email: string, password: string): Promise<UserInfo> {
  try {
    return await invoke<UserInfo>("login", { email, password });
  } catch (error) {
    throw normalizeError(error);
  }
}

/**
 * Sign up with email and password
 * Registration is handled securely by the Rust backend
 */
export async function signup(email: string, password: string): Promise<UserInfo> {
  try {
    return await invoke<UserInfo>("signup", { email, password });
  } catch (error) {
    throw normalizeError(error);
  }
}

/**
 * Logout and clear all stored credentials
 */
export async function logout(): Promise<void> {
  try {
    await invoke("logout");
  } catch (error) {
    console.error("Logout error:", error);
    // Don't throw on logout errors - user should still be logged out locally
  }
}

/**
 * Get current user info (if authenticated)
 * Returns null if not authenticated
 */
export async function getCurrentUser(): Promise<UserInfo | null> {
  try {
    return await invoke<UserInfo | null>("get_current_user");
  } catch (error) {
    console.error("Get current user error:", error);
    return null;
  }
}

/**
 * Check if user is authenticated (quick check, no token validation)
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    return await invoke<boolean>("is_authenticated");
  } catch (error) {
    return false;
  }
}

/**
 * Validate the current session (triggers refresh if needed)
 */
export async function validateSession(): Promise<boolean> {
  try {
    return await invoke<boolean>("validate_token");
  } catch (error) {
    return false;
  }
}

/**
 * Refresh the access token
 * Usually called automatically when token expires
 */
export async function refreshToken(): Promise<UserInfo> {
  try {
    return await invoke<UserInfo>("refresh_token");
  } catch (error) {
    throw normalizeError(error);
  }
}

// ==========================================
// Helpers
// ==========================================

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === "string") {
    return new Error(error);
  }
  if (typeof error === "object" && error !== null) {
    const obj = error as Record<string, unknown>;
    const message =
      (obj.message as string) ||
      (obj.error as string) ||
      (obj.msg as string) ||
      JSON.stringify(error);
    return new Error(message);
  }
  return new Error("Unknown error");
}

// ==========================================
// Auth Context Hook Support
// ==========================================

export interface AuthState {
  user: UserInfo | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

export const initialAuthState: AuthState = {
  user: null,
  isLoading: true,
  isAuthenticated: false,
  error: null,
};
