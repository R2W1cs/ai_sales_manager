import { check, sleep } from "k6";
/**
 * Course lab — k6 spike profile.
 * Usage: k6 run docs/04-testing/perf/k6-spike.js
 */
import http from "k6/http";

export const options = {
  stages: [
    { duration: "30s", target: 10 },
    { duration: "10s", target: 100 },
    { duration: "2m", target: 100 },
    { duration: "30s", target: 10 },
    { duration: "30s", target: 0 },
  ],
};

const BASE = __ENV.API_BASE || "http://127.0.0.1:4000";

export default function () {
  const res = http.get(`${BASE}/health`);
  check(res, { "health reachable": (r) => r.status > 0 });
  sleep(0.15);
}
