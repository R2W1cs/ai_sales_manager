import { check, sleep } from "k6";
/**
 * Course lab — k6 stress profile. Finds the local breaking point.
 * Usage: k6 run docs/04-testing/perf/k6-stress.js
 */
import http from "k6/http";

export const options = {
  stages: [
    { duration: "1m", target: 40 },
    { duration: "2m", target: 80 },
    { duration: "2m", target: 120 },
    { duration: "5m", target: 120 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.05"],
  },
};

const BASE = __ENV.API_BASE || "http://127.0.0.1:4000";

export default function () {
  const res = http.get(`${BASE}/health`);
  check(res, { "status ok-ish": (r) => r.status === 200 || r.status === 429 });
  sleep(0.2);
}
