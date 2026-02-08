//! Validation commands for form inputs
//!
//! These commands provide server-side validation for emails, passwords,
//! and other form fields, ensuring consistent validation between frontend and backend.

use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::LazyLock;

use crate::Result;

// ==========================================
// Validation Result Types
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub errors: Vec<String>,
}

impl ValidationResult {
    pub fn valid() -> Self {
        Self {
            is_valid: true,
            errors: vec![],
        }
    }

    pub fn invalid(errors: Vec<String>) -> Self {
        Self {
            is_valid: false,
            errors,
        }
    }

    pub fn single_error(error: &str) -> Self {
        Self {
            is_valid: false,
            errors: vec![error.to_string()],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PasswordValidation {
    pub is_valid: bool,
    pub errors: Vec<String>,
    pub strength: PasswordStrength,
    pub score: u8,
    pub suggestions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PasswordStrength {
    Weak,
    Fair,
    Good,
    Strong,
}

// ==========================================
// Static Regex Patterns
// ==========================================

static EMAIL_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$").unwrap()
});

static HAS_LOWERCASE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[a-z]").unwrap());

static HAS_UPPERCASE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[A-Z]").unwrap());

static HAS_DIGIT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\d").unwrap());

static HAS_SPECIAL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"[!@#$%^&*(),.?":{}|<>]"#).unwrap());

// ==========================================
// Email Validation
// ==========================================

/// Validate an email address
#[tauri::command]
pub fn validate_email(email: String) -> Result<ValidationResult> {
    let email = email.trim();

    if email.is_empty() {
        return Ok(ValidationResult::single_error("Email é obrigatório"));
    }

    if email.len() > 254 {
        return Ok(ValidationResult::single_error(
            "Email muito longo (máximo 254 caracteres)",
        ));
    }

    if !EMAIL_REGEX.is_match(email) {
        return Ok(ValidationResult::single_error("Email inválido"));
    }

    // Check for common typos in domain
    let domain = email.split('@').last().unwrap_or("");
    let common_typos = [
        ("gmial.com", "gmail.com"),
        ("gmal.com", "gmail.com"),
        ("gamil.com", "gmail.com"),
        ("gnail.com", "gmail.com"),
        ("hotmal.com", "hotmail.com"),
        ("hotmai.com", "hotmail.com"),
        ("outloo.com", "outlook.com"),
        ("outlok.com", "outlook.com"),
    ];

    for (typo, correct) in common_typos {
        if domain == typo {
            return Ok(ValidationResult::invalid(vec![format!(
                "Você quis dizer @{}?",
                correct
            )]));
        }
    }

    Ok(ValidationResult::valid())
}

// ==========================================
// Password Validation
// ==========================================

/// Validate a password and return strength analysis
#[tauri::command]
pub fn validate_password(password: String) -> Result<PasswordValidation> {
    let mut errors = Vec::new();
    let mut suggestions = Vec::new();
    let mut score: u8 = 0;

    // Minimum length check
    if password.len() < 6 {
        errors.push("Senha deve ter no mínimo 6 caracteres".to_string());
    } else {
        score += 1;
    }

    // Maximum length check
    if password.len() > 128 {
        errors.push("Senha muito longa (máximo 128 caracteres)".to_string());
    }

    // Complexity checks
    let has_lower = HAS_LOWERCASE.is_match(&password);
    let has_upper = HAS_UPPERCASE.is_match(&password);
    let has_digit = HAS_DIGIT.is_match(&password);
    let has_special = HAS_SPECIAL.is_match(&password);

    if has_lower {
        score += 1;
    } else {
        suggestions.push("Adicione letras minúsculas".to_string());
    }

    if has_upper {
        score += 1;
    } else {
        suggestions.push("Adicione letras maiúsculas".to_string());
    }

    if has_digit {
        score += 1;
    } else {
        suggestions.push("Adicione números".to_string());
    }

    if has_special {
        score += 1;
    } else {
        suggestions.push("Adicione caracteres especiais (!@#$%...)".to_string());
    }

    // Length bonus
    if password.len() >= 12 {
        score += 1;
    } else if password.len() >= 8 {
        suggestions.push("Use 12+ caracteres para maior segurança".to_string());
    }

    // Common password check
    let common_passwords = [
        "123456", "password", "12345678", "qwerty", "123456789", "12345", "1234", "111111",
        "1234567", "dragon", "123123", "baseball", "iloveyou", "trustno1", "sunshine", "master",
        "welcome", "shadow", "ashley", "football", "jesus", "michael", "ninja", "mustang",
    ];

    if common_passwords.contains(&password.to_lowercase().as_str()) {
        errors.push("Esta senha é muito comum".to_string());
        score = 0;
    }

    // Determine strength
    let strength = match score {
        0..=1 => PasswordStrength::Weak,
        2..=3 => PasswordStrength::Fair,
        4..=5 => PasswordStrength::Good,
        _ => PasswordStrength::Strong,
    };

    Ok(PasswordValidation {
        is_valid: errors.is_empty() && password.len() >= 6,
        errors,
        strength,
        score,
        suggestions,
    })
}

// ==========================================
// Meeting Title Validation
// ==========================================

/// Validate a meeting title
#[tauri::command]
pub fn validate_meeting_title(title: String) -> Result<ValidationResult> {
    let title = title.trim();

    if title.is_empty() {
        return Ok(ValidationResult::single_error("Título é obrigatório"));
    }

    if title.len() < 3 {
        return Ok(ValidationResult::single_error(
            "Título deve ter no mínimo 3 caracteres",
        ));
    }

    if title.len() > 200 {
        return Ok(ValidationResult::single_error(
            "Título muito longo (máximo 200 caracteres)",
        ));
    }

    // Check for potentially harmful content
    let forbidden_patterns = ["<script", "javascript:", "data:"];
    for pattern in forbidden_patterns {
        if title.to_lowercase().contains(pattern) {
            return Ok(ValidationResult::single_error("Título contém conteúdo inválido"));
        }
    }

    Ok(ValidationResult::valid())
}

// ==========================================
// Username Validation
// ==========================================

/// Validate a username/display name
#[tauri::command]
pub fn validate_username(username: String) -> Result<ValidationResult> {
    let username = username.trim();

    if username.is_empty() {
        return Ok(ValidationResult::single_error("Nome é obrigatório"));
    }

    if username.len() < 2 {
        return Ok(ValidationResult::single_error(
            "Nome deve ter no mínimo 2 caracteres",
        ));
    }

    if username.len() > 50 {
        return Ok(ValidationResult::single_error(
            "Nome muito longo (máximo 50 caracteres)",
        ));
    }

    // Check for only spaces/special chars
    if username.chars().all(|c| !c.is_alphanumeric()) {
        return Ok(ValidationResult::single_error(
            "Nome deve conter letras ou números",
        ));
    }

    Ok(ValidationResult::valid())
}

// ==========================================
// URL Validation
// ==========================================

/// Validate a URL
#[tauri::command]
pub fn validate_url(url: String) -> Result<ValidationResult> {
    let url = url.trim();

    if url.is_empty() {
        return Ok(ValidationResult::valid()); // URL is optional
    }

    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Ok(ValidationResult::single_error(
            "URL deve começar com http:// ou https://",
        ));
    }

    if url.len() > 2048 {
        return Ok(ValidationResult::single_error(
            "URL muito longa (máximo 2048 caracteres)",
        ));
    }

    // Basic URL structure validation
    if !url.contains('.') || url.ends_with('.') {
        return Ok(ValidationResult::single_error("URL inválida"));
    }

    Ok(ValidationResult::valid())
}

// ==========================================
// Session Code Validation
// ==========================================

/// Validate a session code format
#[tauri::command]
pub fn validate_session_code(code: String) -> Result<ValidationResult> {
    let code = code.trim().to_uppercase();

    if code.is_empty() {
        return Ok(ValidationResult::single_error("Código é obrigatório"));
    }

    // Expected format: XXXX-XXXX (8 alphanumeric characters)
    let clean_code: String = code.chars().filter(|c| c.is_alphanumeric()).collect();

    if clean_code.len() != 8 {
        return Ok(ValidationResult::single_error(
            "Código deve ter 8 caracteres (formato: XXXX-XXXX)",
        ));
    }

    if !clean_code.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Ok(ValidationResult::single_error(
            "Código deve conter apenas letras e números",
        ));
    }

    Ok(ValidationResult::valid())
}

// ==========================================
// Tests
// ==========================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_emails() {
        let result = validate_email("test@example.com".to_string()).unwrap();
        assert!(result.is_valid);

        let result = validate_email("user.name+tag@domain.co".to_string()).unwrap();
        assert!(result.is_valid);
    }

    #[test]
    fn test_invalid_emails() {
        let result = validate_email("".to_string()).unwrap();
        assert!(!result.is_valid);

        let result = validate_email("notanemail".to_string()).unwrap();
        assert!(!result.is_valid);

        let result = validate_email("@domain.com".to_string()).unwrap();
        assert!(!result.is_valid);
    }

    #[test]
    fn test_typo_detection() {
        let result = validate_email("user@gmial.com".to_string()).unwrap();
        assert!(!result.is_valid);
        assert!(result.errors[0].contains("gmail.com"));
    }

    #[test]
    fn test_password_strength() {
        // Weak password
        let result = validate_password("123".to_string()).unwrap();
        assert!(!result.is_valid);
        assert!(matches!(result.strength, PasswordStrength::Weak));

        // Strong password
        let result = validate_password("MyStr0ng!Pass123".to_string()).unwrap();
        assert!(result.is_valid);
        assert!(matches!(result.strength, PasswordStrength::Strong));
    }

    #[test]
    fn test_common_password_detection() {
        let result = validate_password("password".to_string()).unwrap();
        assert!(!result.is_valid);
        assert!(result.errors.iter().any(|e| e.contains("comum")));
    }

    #[test]
    fn test_meeting_title_validation() {
        let result = validate_meeting_title("Team Standup".to_string()).unwrap();
        assert!(result.is_valid);

        let result = validate_meeting_title("".to_string()).unwrap();
        assert!(!result.is_valid);

        let result = validate_meeting_title("ab".to_string()).unwrap();
        assert!(!result.is_valid);
    }
}
