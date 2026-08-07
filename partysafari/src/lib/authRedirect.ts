export function resolveSafeNextPath(search: string, fallback = "/dashboard") {
  const requested = new URLSearchParams(search).get("next");

  if (!requested || !requested.startsWith("/") || requested.startsWith("//") || requested.includes("\\")) {
    return fallback;
  }

  return requested;
}
