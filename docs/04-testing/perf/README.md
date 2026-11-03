# Performance lab scripts (k6)

Course-lab profiles used for the testing PDF. Point them at a running local API.

```bash
# API must be up on :4000
k6 run docs/04-testing/perf/k6-load.js
k6 run docs/04-testing/perf/k6-stress.js
k6 run docs/04-testing/perf/k6-spike.js
k6 run docs/04-testing/perf/k6-soak.js
# shorter soak dry-run
k6 run -e SOAK_MINUTES=5 docs/04-testing/perf/k6-soak.js
```

Optional: `API_BASE=http://127.0.0.1:4000`.

Numbers reported in [`../AI-Sales-Manager-Testing-Report.pdf`](../AI-Sales-Manager-Testing-Report.pdf) come from these profiles on the Docker Postgres + Redis lab stack.
