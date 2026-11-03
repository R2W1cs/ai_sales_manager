import { check, sleep } from "k6";
/**
 * Course lab — k6 soak profile (long steady load).
 * Usage: k6 run docs/04-testing/perf/k6-soak.js
 * For a shorter dry run: k6 run -e SOAK_MINUTES=5 docs/04-testing/perf/k6-soak.js
 */
import http from "k6/http";

const minutes = Number(__ENV.SOAK_MINUTES || 120);

export const options = {
  stages: [
    { duration: "2m", target: 25 },
    { duration: `${minutes}m`, target: 25 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<400"],
  },
};

const BASE = __ENV.API_BASE || "http://127.0.0.1:4000";

export default function () {
  const res = http.get(`${BASE}/health`);
  check(res, { "health 200": (r) => r.status === 200 });
  sleep(0.4);
}
