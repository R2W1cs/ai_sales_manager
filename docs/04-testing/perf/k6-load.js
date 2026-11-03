import { check, sleep } from "k6";
/**
 * Course lab — k6 load profile against the local API.
 * Usage: k6 run docs/04-testing/perf/k6-load.js
 */
import http from "k6/http";

export const options = {
  stages: [
    { duration: "2m", target: 50 },
    { duration: "8m", target: 50 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<300"],
  },
};

const BASE = __ENV.API_BASE || "http://127.0.0.1:4000";

export default function () {
  const health = http.get(`${BASE}/health`);
  check(health, { "health 200": (r) => r.status === 200 });
  sleep(0.3);
}
