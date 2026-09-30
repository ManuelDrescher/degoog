import { afterAll, describe, expect, test } from "bun:test";
import { fetchViaCurl } from "../../src/server/extensions/transports/builtins/curl/curl-fetch";

const HANG_MS = 5000;

const server = Bun.serve({
  port: 0,
  fetch: async (req) => {
    if (new URL(req.url).pathname === "/fast") return new Response("hello");
    await Bun.sleep(HANG_MS);
    return new Response("late");
  },
});

const base = `http://127.0.0.1:${server.port}`;

afterAll(() => {
  server.stop(true);
});

describe("curl transport abort", () => {
  test("an abort kills the curl process instead of waiting for the response", async () => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 100);
    const started = Date.now();

    await expect(fetchViaCurl(`${base}/slow`, { signal: ac.signal })).rejects.toThrow();

    expect(Date.now() - started).toBeLessThan(HANG_MS / 2);
  });

  test("an already aborted signal never spawns curl", async () => {
    const ac = new AbortController();
    ac.abort();

    await expect(fetchViaCurl(`${base}/fast`, { signal: ac.signal })).rejects.toThrow();
  });

  test("a request that is not aborted still resolves", async () => {
    const ac = new AbortController();
    const res = await fetchViaCurl(`${base}/fast`, { signal: ac.signal });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("hello");
  });
});
