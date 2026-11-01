import * as crypto from "node:crypto";

export interface JwtHeader {
  alg?: string;
  typ?: string;
}

export interface JwtPayload {
  sub?: string;
  typ?: string;
  iss?: string;
  aud?: string;
  iat?: number;
  exp?: number;
}

export interface VerifiedAccessToken {
  sub: string;
  typ?: string;
}

/**
 * Extracts Bearer token from an Authorization header.
 */
export function extractBearerToken(authHeader?: string): string | undefined {
  if (!authHeader || typeof authHeader !== "string") {
    return undefined;
  }
  const parts = authHeader.trim().split(/\s+/);
  if (parts.length === 2 && parts[0]?.toLowerCase() === "bearer" && parts[1]) {
    return parts[1];
  }
  return undefined;
}

/**
 * Timing-safe HMAC-SHA256 JWT access token verification.
 */
export function verifyAccessToken(token: string, secret: string): VerifiedAccessToken {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT structure");
  }

  const encHeader = parts[0];
  const encPayload = parts[1];
  const signature = parts[2];
  if (!encHeader || !encPayload || !signature) {
    throw new Error("Invalid JWT structure");
  }

  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(`${encHeader}.${encPayload}`)
    .digest("base64url");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new Error("Invalid token signature");
  }

  const header = JSON.parse(Buffer.from(encHeader, "base64url").toString("utf8")) as JwtHeader;
  if (header.alg !== "HS256") {
    throw new Error("Unsupported algorithm");
  }

  const payload = JSON.parse(Buffer.from(encPayload, "base64url").toString("utf8")) as JwtPayload;
  const now = Math.floor(Date.now() / 1000);
  const skew = 30;

  if (typeof payload.exp === "number" && now - skew > payload.exp) {
    throw new Error("Token expired");
  }
  if (typeof payload.iat === "number" && now + skew < payload.iat) {
    throw new Error("Token not yet active");
  }
  if (payload.iss && payload.iss !== "aisales") {
    throw new Error("Invalid issuer");
  }
  if (payload.aud && payload.aud !== "access") {
    throw new Error("Invalid audience");
  }
  if (payload.typ !== "access") {
    throw new Error("Invalid token type");
  }
  if (!payload.sub) {
    throw new Error("Missing subject");
  }

  return { sub: payload.sub, typ: payload.typ };
}
