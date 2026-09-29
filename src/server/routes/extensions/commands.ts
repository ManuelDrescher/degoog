import { type Context, Hono } from "hono";
import {
  getCommandsApiResponse,
  matchBangCommand,
} from "../../extensions/commands/registry";
import {
  getEngineSearchType,
  getEngineSearchTypes,
  singleEngineConfig,
} from "../../extensions/engines/catalog";
import { handleSearch } from "../../search/handlers";
import type { SearchBody, SearchParams, SearchType } from "../../types/search";
import { getLocale, readObjectBody } from "../../utils/hono";
import { logger } from "../../utils/logger";
import { isDisabled } from "../../utils/settings/plugin-settings";
import { buildSignedProxyUrl } from "../../utils/net/proxy-sign";
import { _applyRateLimit } from "../../utils/search";
import { guardApiKey } from "../../utils/security/api-key-guard";
import { parseSearchBody, parseSearchRequest } from "../search/parsers";
import { publicBodyLimit } from "../_guards";
import { getClientIp } from "../../utils/net/request";
import { applyFilter, syncVortexSignal } from "../../utils/extension-support/translation-circuit";

const router = new Hono();

router.get("/api/commands", async (c) => {
  return c.json(await getCommandsApiResponse());
});

type CommandRequest = {
  q: string | undefined;
  type: string | undefined;
  page: unknown;
  search: Omit<SearchParams, "query">;
};

const _runCommand = async (
  c: Context,
  { q, type, page: rawPage, search }: CommandRequest,
): Promise<Response> => {
  if (!q) return c.json({ error: "Missing query parameter 'q'" }, 400);

  const match = matchBangCommand(q);
  if (!match) return c.json({ error: "Unknown command" }, 404);

  if (match.type === "command") {
    if (await isDisabled(match.commandId)) {
      return c.json({ error: "This plugin is disabled" }, 403);
    }
  }

  if (match.type === "engine") {
    if (!match.query.trim())
      return c.json(
        { error: "Missing search query after engine shortcut" },
        400,
      );
    const limitRes = await _applyRateLimit(c);
    if (limitRes) return limitRes;
    const authRes = await guardApiKey(c, "apiKeySearchEnabled");
    if (authRes) return authRes;
    const requestedType = type?.trim().replace(/^tab:engine:/, "") || undefined;
    const resolvedType =
      (await getEngineSearchType(match.engineId, requestedType)) ?? "web";
    const searchTypes = await getEngineSearchTypes(match.engineId);
    const response = await handleSearch({
      ...search,
      query: match.query,
      engines: singleEngineConfig(match.engineId),
      searchType: resolvedType as SearchType,
    });
    return c.json({
      ...response,
      type: "engine",
      engineId: match.engineId,
      primaryType: response.type,
      searchTypes,
    });
  }

  if (match.command.respectRateLimiting) {
    const limitRes = await _applyRateLimit(c);
    if (limitRes) return limitRes;
  }

  const page = Math.max(
    1,
    Math.min(10, Math.floor(Number(rawPage)) || 1),
  );

  const clientIp = getClientIp(c);

  const t0 = performance.now();

  const language = getLocale(c);

  const result = await match.command.execute(match.args, {
    clientIp,
    page,
    signProxyUrl: buildSignedProxyUrl,
  });
  logger.debug(
    "plugin",
    `${match.command.trigger} executed in ${Math.round(performance.now() - t0)}ms`,
  );
  return c.json({
    type: "command",
    trigger: match.command.trigger,
    title: result.title,
    html: applyFilter(
      match.command.t
        ? syncVortexSignal(result.html, match.command.t, language)
        : result.html,
      `commands/${match.commandId}`,
    ),
    action: result.action,
    page,
    totalPages: result.totalPages ?? 1,
  });
};

router.get("/api/command", async (c) => {
  const { origQ: _origQ, ...search } = parseSearchRequest(c);
  return _runCommand(c, {
    q: c.req.query("q"),
    type: c.req.query("type"),
    page: c.req.query("page"),
    search,
  });
});

router.post("/api/command", publicBodyLimit, async (c) => {
  const body = await readObjectBody<SearchBody>(c);
  if (!body) return c.json({ error: "Invalid JSON" }, 400);
  return _runCommand(c, {
    q: body.query,
    type: body.type,
    page: body.page,
    search: parseSearchBody(body),
  });
});

export default router;
