// Returns the address lowercased and trimmed, or null if it doesn't look like an email address.
export function parseEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z0-9-]{2,}$/.test(email)) return null;
  return email;
}
