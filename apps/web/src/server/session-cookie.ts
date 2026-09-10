export function isHttps(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  return forwarded
    ? forwarded.split(",")[0]?.trim() === "https"
    : new URL(request.url).protocol === "https:";
}

export function sessionCookie(
  token: string,
  secure: boolean,
  maxAge: number,
): string {
  return [
    `shorts_os_session=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}
