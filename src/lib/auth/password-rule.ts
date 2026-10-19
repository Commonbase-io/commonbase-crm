export function passwordRuleError(password: string): string | null {
  if (password.length > 128) return "Password must be 128 characters or fewer.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(password)) return "Password must include a letter.";
  if (!/\d/.test(password)) return "Password must include a digit.";
  return null;
}
