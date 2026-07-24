export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 80) return "Name must be between 2 and 80 characters.";
  return null;
}

export function validateEmail(email: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
  return null;
}

export function validatePhone(phone: string): string | null {
  if (!/^\+\d{8,15}$/.test(phone)) return "Enter a valid phone number (e.g. +201234567890).";
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 8 || password.length > 128) return "Password must be between 8 and 128 characters.";
  return null;
}

export function validateConfirmPassword(password: string, confirm: string): string | null {
  if (password !== confirm) return "Passwords do not match.";
  return null;
}