export function getServerSecret(): string {
  return process.env.AR_SECRET || process.env.AUTOTYPER_SECRET || "ar-dev-secret";
}

export function isAuthorized(request: Request): boolean {
  const secret = getServerSecret();
  const header = request.headers.get("x-ar-secret");
  if (header && header === secret) return true;

  const url = new URL(request.url);
  const query = url.searchParams.get("secret");
  if (query && query === secret) return true;

  return false;
}
