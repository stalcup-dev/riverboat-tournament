export interface OriginPolicy {
  allowAny: boolean;
  allowedOrigins: string[];
}

export function parseOriginPolicy(corsOriginRaw: string | undefined, nodeEnv: string): OriginPolicy {
  const isDev = nodeEnv !== "production";
  const values = (corsOriginRaw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (values.length === 0) {
    return isDev ? { allowAny: true, allowedOrigins: [] } : { allowAny: false, allowedOrigins: [] };
  }

  const allowAny = values.includes("*");
  if (allowAny && !isDev) {
    throw new Error('CORS_ORIGIN cannot contain "*" in production.');
  }

  const allowedOrigins = values
    .filter((value) => value !== "*")
    .map((value) => normalizeOrigin(value))
    .filter((value): value is string => Boolean(value));

  return { allowAny, allowedOrigins };
}

export function isOriginAllowed(originPolicy: OriginPolicy, requestOrigin: string | undefined): boolean {
  if (originPolicy.allowAny) {
    return true;
  }

  if (!requestOrigin) {
    return originPolicy.allowedOrigins.length === 0;
  }

  const normalized = normalizeOrigin(requestOrigin);
  if (!normalized) {
    return false;
  }

  return originPolicy.allowedOrigins.includes(normalized);
}

export function normalizeOrigin(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  try {
    const url = new URL(trimmed);
    return `${url.protocol}//${url.host}`;
  } catch {
    return undefined;
  }
}
