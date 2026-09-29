import type { Context, Hono } from "hono";
import { search } from "../../search";
import type { SearchType } from "../../types/search";
import { _applyRateLimit, parseEngineConfig } from "../../utils/search";
import { guardApiKey } from "../../utils/security/api-key-guard";
import { applyDomainRules } from "../../search/domain-rules";
import { logger } from "../../utils/logger";
import { publicBodyLimit } from "../_guards";

const _feelLucky = async (
  c: Context,
  params: URLSearchParams,
): Promise<Response> => {
  const limitRes = await _applyRateLimit(c);
  if (limitRes) return limitRes;
  const authRes = await guardApiKey(c, "apiKeySearchEnabled");
  if (authRes) return authRes;
  const query = params.get("q");
  if (!query) return c.json({ error: "Missing query parameter 'q'" }, 400);

  const engines = parseEngineConfig(params);
  const type = "web" as SearchType;
  const response = await search(query, engines, type, 1);
  const luckyResults = await applyDomainRules(response.results);
  if (luckyResults.length > 0) return c.redirect(luckyResults[0].url);
  return c.json({ error: "No results found" }, 404);
};

const _formParams = async (c: Context): Promise<URLSearchParams | null> => {
  try {
    const form = await c.req.formData();
    const params = new URLSearchParams();
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") params.set(key, value);
    }
    return params;
  } catch (err) {
    logger.debug("search", "invalid lucky form data", err);
    return null;
  }
};

export function registerLuckyRoute(router: Hono): void {
  router.get("/api/lucky", (c) =>
    _feelLucky(c, new URL(c.req.url).searchParams),
  );

  router.post("/api/lucky", publicBodyLimit, async (c) => {
    const params = await _formParams(c);
    if (!params) return c.json({ error: "Invalid form data" }, 400);
    return _feelLucky(c, params);
  });
}
