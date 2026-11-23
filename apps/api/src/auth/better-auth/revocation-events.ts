import Redis from "ioredis";

import { env } from "@app/shared/server";

import { logger } from "../../lib/logger";

export const AUTH_REVOCATION_CHANNEL = "realtime:auth:revocation";

export interface AuthRevocationEvent {
  type: "member_removed" | "role_changed" | "session_revoked" | "mfa_changed";
  userId: string;
  businessId?: string;
  /** Session record ID (`Session.id`), never `Session.token`. */
  sessionId?: string;
  /** Session record ID (`Session.id`) to keep active when revoking other sessions. */
  excludeSessionId?: string;
}

let publisherClient: Redis | null = null;
const localListeners = new Set<(event: AuthRevocationEvent) => void>();

function getPublisher(): Redis | null {
  if (env.NODE_ENV === "test" && process.env.ENABLE_REDIS_REVOCATION_IN_TEST !== "true") {
    return null;
  }
  if (publisherClient) {
    return publisherClient;
  }
  try {
    if (env.REDIS_URL) {
      publisherClient = new Redis(env.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      publisherClient.on("error", (err) => {
        logger.warn({ err: err.message }, "Auth revocation Redis publisher error");
      });
    }
  } catch (err) {
    logger.warn({ err }, "Failed to create Redis publisher for auth revocation");
    publisherClient = null;
  }
  return publisherClient;
}

export function registerLocalRevocationListener(
  listener: (event: AuthRevocationEvent) => void,
): () => void {
  localListeners.add(listener);
  return () => {
    localListeners.delete(listener);
  };
}

export async function publishAuthRevocation(event: AuthRevocationEvent): Promise<void> {
  for (const listener of localListeners) {
    try {
      listener(event);
    } catch (err) {
      logger.warn({ err }, "Local auth revocation listener failed");
    }
  }

  const pub = getPublisher();
  if (!pub) return;

  try {
    await pub.publish(AUTH_REVOCATION_CHANNEL, JSON.stringify(event));
  } catch (err) {
    logger.warn({ err, eventType: event.type }, "Failed to publish auth revocation over Redis");
  }
}

export async function closeAuthRevocationPublisher(): Promise<void> {
  if (publisherClient) {
    try {
      await publisherClient.quit();
    } catch {
      // ignore
    }
    publisherClient = null;
  }
}
