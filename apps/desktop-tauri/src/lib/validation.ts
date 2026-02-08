/**
 * TypeScript bindings for Rust validation commands
 *
 * These functions call the Rust backend for form validation,
 * ensuring consistent validation between frontend and backend.
 */

import { invoke } from "@tauri-apps/api/core";

// ==========================================
// Validation Result Types
// ==========================================

export interface ValidationResult {
  is_valid: boolean;
  errors: string[];
}

export type PasswordStrength = "weak" | "fair" | "good" | "strong";

export interface PasswordValidation {
  is_valid: boolean;
  errors: string[];
  strength: PasswordStrength;
  score: number;
  suggestions: string[];
}

// ==========================================
// Email Validation
// ==========================================

/**
 * Validate an email address
 *
 * Checks:
 * - Required field
 * - Maximum length (254 chars)
 * - Valid email format (RFC 5322)
 * - Common typo detection (gmial.com -> gmail.com)
 */
export async function validateEmail(email: string): Promise<ValidationResult> {
  return invoke<ValidationResult>("validate_email", { email });
}

// ==========================================
// Password Validation
// ==========================================

/**
 * Validate a password and analyze its strength
 *
 * Returns:
 * - is_valid: true if password meets minimum requirements
 * - strength: weak | fair | good | strong
 * - score: 0-6 numeric score
 * - errors: list of validation errors
 * - suggestions: tips to improve password strength
 */
export async function validatePassword(
  password: string
): Promise<PasswordValidation> {
  return invoke<PasswordValidation>("validate_password", { password });
}

// ==========================================
// Meeting Title Validation
// ==========================================

/**
 * Validate a meeting title
 *
 * Checks:
 * - Required field
 * - Minimum length (3 chars)
 * - Maximum length (200 chars)
 * - No harmful content (XSS patterns)
 */
export async function validateMeetingTitle(
  title: string
): Promise<ValidationResult> {
  return invoke<ValidationResult>("validate_meeting_title", { title });
}

// ==========================================
// Username Validation
// ==========================================

/**
 * Validate a username/display name
 *
 * Checks:
 * - Required field
 * - Minimum length (2 chars)
 * - Maximum length (50 chars)
 * - Must contain at least one alphanumeric character
 */
export async function validateUsername(
  username: string
): Promise<ValidationResult> {
  return invoke<ValidationResult>("validate_username", { username });
}

// ==========================================
// URL Validation
// ==========================================

/**
 * Validate a URL (optional field)
 *
 * Checks:
 * - Must start with http:// or https://
 * - Maximum length (2048 chars)
 * - Valid URL structure
 */
export async function validateUrl(url: string): Promise<ValidationResult> {
  return invoke<ValidationResult>("validate_url", { url });
}

// ==========================================
// Session Code Validation
// ==========================================

/**
 * Validate a session code format
 *
 * Expected format: XXXX-XXXX (8 alphanumeric characters)
 */
export async function validateSessionCode(
  code: string
): Promise<ValidationResult> {
  return invoke<ValidationResult>("validate_session_code", { code });
}

// ==========================================
// Helper Functions
// ==========================================

/**
 * Get password strength color for UI
 */
export function getPasswordStrengthColor(strength: PasswordStrength): string {
  switch (strength) {
    case "weak":
      return "text-red-500";
    case "fair":
      return "text-yellow-500";
    case "good":
      return "text-blue-500";
    case "strong":
      return "text-green-500";
    default:
      return "text-slate-400";
  }
}

/**
 * Get password strength label for UI
 */
export function getPasswordStrengthLabel(strength: PasswordStrength): string {
  switch (strength) {
    case "weak":
      return "Fraca";
    case "fair":
      return "Regular";
    case "good":
      return "Boa";
    case "strong":
      return "Forte";
    default:
      return "";
  }
}

/**
 * Get password strength progress percentage for UI
 */
export function getPasswordStrengthProgress(score: number): number {
  return Math.min(100, Math.round((score / 6) * 100));
}
