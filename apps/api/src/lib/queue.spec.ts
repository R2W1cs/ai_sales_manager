import type { RedisOptions } from "bullmq";

import { bullmqConnection } from "./queue";

describe("bullmqConnection", () => {
  it("parses standard redis:// URLs without TLS", () => {
    const conn = bullmqConnection("redis://:mypassword@redis.internal:6379/2") as RedisOptions;
    expect(conn.host).toBe("redis.internal");
    expect(conn.port).toBe(6379);
    expect(conn.password).toBe("mypassword");
    expect(conn.db).toBe(2);
    expect(conn.tls).toBeUndefined();
    expect(conn.maxRetriesPerRequest).toBeNull();
  });

  it("enables TLS when rediss:// scheme is used", () => {
    const conn = bullmqConnection(
      "rediss://default:secret@secure-redis.cloud:6380/0",
    ) as RedisOptions;
    expect(conn.host).toBe("secure-redis.cloud");
    expect(conn.port).toBe(6380);
    expect(conn.username).toBe("default");
    expect(conn.password).toBe("secret");
    expect(conn.db).toBe(0);
    expect(conn.tls).toEqual({});
    expect(conn.maxRetriesPerRequest).toBeNull();
  });

  it("defaults port to 6380 for rediss:// when not explicitly specified", () => {
    const conn = bullmqConnection("rediss://secure-redis.cloud") as RedisOptions;
    expect(conn.host).toBe("secure-redis.cloud");
    expect(conn.port).toBe(6380);
    expect(conn.tls).toEqual({});
  });
});
