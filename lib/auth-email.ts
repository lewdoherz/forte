/** Better Auth's non-deliverable identity addresses are not contact addresses. */
export function isPlaceholderEmail(email: string): boolean {
  const domain = email.slice(email.lastIndexOf("@") + 1).trim().toLowerCase();
  return domain === "placeholder.invalid" || domain.endsWith(".placeholder.invalid");
}
