/**
 * @fccview here
 * scraping is a crazy business. This shit is hard.
 * For example, our big G has very strict TLS policies, which means sometimes it'll
 * randomly block bun's fetch.
 *
 * The best solution I could come up with is to use curl binaries as fallback for requests.
 * Until/if bun implements TLS pinning, this is the best we can do.
 *
 * Also bun doesn't support socks5 proxies, so we use a separate library for that. How fun.
 *
 */

import { fetch as bunFetch } from "bun";
import { resolveTransport } from "../../extensions/transports/registry";
import type {
  ProxyAwareFetch,
  Transport,
  TransportContext,
  TransportFetchOptions,
} from "../../types/extension";
import { useCache } from "../cache/cache";
import { fetchViaHttpProxy } from "./http-proxy-fetch";
import { logger } from "../logger";
import { asBoolean } from "../settings/plugin-settings";
import { fetchViaSocks, isSocksProxy } from "./socks-fetch";
import { getInstanceSettings } from "../settings/server-settings";
export function parseOutgoingTransport(raw: string | undefined): string {
  return raw?.trim() || "fetch";
}

const ALLOWED_HOSTS_ENV = "DEGOOG_OUTGOING_ALLOWED_HOSTS";
const ANY_HOST = "*";
const SUBDOMAIN_WILDCARD = "*.";

export const parseAllowedHosts = (raw: string | undefined): string[] | null => {
  const hosts = (raw ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return hosts.length > 0 ? hosts : null;
};

let _envAllowedHosts: string[] | null | undefined;

const _allowedHosts = (): string[] | null => {
  if (_envAllowedHosts === undefined) {
    _envAllowedHosts = parseAllowedHosts(process.env[ALLOWED_HOSTS_ENV]);
  }
  return _envAllowedHosts;
};

const _hostMatches = (host: string, pattern: string): boolean => {
  if (pattern === ANY_HOST) return true;
  if (pattern.startsWith(SUBDOMAIN_WILDCARD)) {
    return host.endsWith(pattern.slice(SUBDOMAIN_WILDCARD.length - 1));
  }
  return host === pattern;
};

export const isUrlAllowedForOutgoing = (
  url: string,
  allowed: string[] | null = _allowedHosts(),
): boolean => {
  if (!allowed) return true;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return allowed.some((pattern) => _hostMatches(host, pattern));
};

let proxyIndex = 0;

const PROXY_ENV_PLACEHOLDER_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

function envNameOk(name: string): boolean {
  const allowlist = process.env.DEGOOG_PROXY_ENV_ALLOWLIST ?? "";
  return allowlist
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .some((entry) => {
      if (entry === "*") return true;
      if (entry.endsWith("*")) return name.startsWith(entry.slice(0, -1));
      return name === entry;
    });
}

export function proxyEnv(value: string): string {
  return value.replace(PROXY_ENV_PLACEHOLDER_RE, (match, name: string) => {
    if (!envNameOk(name)) return match;
    return process.env[name] ?? match;
  });
}

const MASKED_PROXY = "***";

export function maskProxy(proxyUrl: string): string {
  try {
    const parsed = new URL(proxyUrl);
    if (parsed.username) parsed.username = "***";
    if (parsed.password) parsed.password = "***";
    return parsed.toString();
  } catch {
    return MASKED_PROXY;
  }
}

function parseProxyUrlsList(rawList: string[]): string[] {
  const out: string[] = [];
  for (const raw of rawList) {
    if (typeof raw !== "string") continue;
    for (const line of raw.split("\n")) {
      const trimmed = proxyEnv(line.trim());
      if (trimmed) out.push(trimmed);
    }
  }
  return out;
}

function _buildProxyFetch(
  proxyUrl?: string,
  timeoutMs?: number,
): ProxyAwareFetch {
  return async (url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    const redirect = init?.redirect ?? "follow";
    const signal = init?.signal ?? undefined;
    const headers = init?.headers as Record<string, string> | undefined;
    const body = typeof init?.body === "string" ? init.body : undefined;

    if (!proxyUrl) {
      return bunFetch(url, { method, redirect, signal, headers, body });
    }

    if (isSocksProxy(proxyUrl)) {
      return fetchViaSocks(
        url,
        proxyUrl,
        {
          method,
          redirect,
          signal,
          headers,
          body,
        },
        timeoutMs,
      );
    }

    return fetchViaHttpProxy(
      url,
      proxyUrl,
      {
        method,
        redirect,
        signal,
        headers,
        body,
      },
      timeoutMs,
    );
  };
}

export interface OutgoingProxyOptions {
  proxyOverrideEnabled?: boolean;
  proxyOverrideUrls?: string | string[];
}

export interface OutgoingFetchOptions extends OutgoingProxyOptions {
  engineId?: string;
  pinnedProxyUrl?: string | null;
}

export async function pickProxyUrl(
  opts?: OutgoingProxyOptions,
): Promise<string | undefined> {
  const settings = await getInstanceSettings();
  const proxyOverrideEnabled = opts?.proxyOverrideEnabled === true;
  const proxyOverrideRaw = opts?.proxyOverrideUrls;

  const globalEnabled = asBoolean(settings.proxyEnabled);
  const globalProxyUrlsRaw = settings.proxyUrls;
  const globalUrls = parseProxyUrlsList(
    typeof globalProxyUrlsRaw === "string" ? [globalProxyUrlsRaw] : [],
  );

  const overrideUrls = parseProxyUrlsList(
    Array.isArray(proxyOverrideRaw)
      ? proxyOverrideRaw
      : typeof proxyOverrideRaw === "string"
        ? [proxyOverrideRaw]
        : [],
  );

  const useProxy = proxyOverrideEnabled
    ? overrideUrls.length > 0
    : globalEnabled && globalUrls.length > 0;

  const urls = proxyOverrideEnabled ? overrideUrls : globalUrls;
  return useProxy ? urls[proxyIndex++ % urls.length] : undefined;
}

async function buildTransportContext(
  transportName: string,
  opts?: OutgoingFetchOptions,
): Promise<{ transport: Transport; context: TransportContext }> {
  const proxyUrl =
    opts?.pinnedProxyUrl !== undefined
      ? opts.pinnedProxyUrl ?? undefined
      : await pickProxyUrl(opts);
  const transport = resolveTransport(transportName);
  return {
    transport,
    context: {
      proxyUrl,
      engineId: opts?.engineId,
      fetch: _buildProxyFetch(proxyUrl, transport.timeoutMs),
      useCache,
    },
  };
}

export async function outgoingFetch(
  url: string,
  options: TransportFetchOptions = {},
  transportName: string = "fetch",
  ctx?: OutgoingFetchOptions,
): Promise<Response> {
  const host = new URL(url).hostname;
  if (!isUrlAllowedForOutgoing(url)) {
    logger.warn("outgoing", `${ALLOWED_HOSTS_ENV} refused -> ${host}`);
    throw new Error(`Outgoing host not allowed: ${host}`);
  }
  const { transport, context } = await buildTransportContext(transportName, ctx);
  if (context.proxyUrl) {
    logger.debug(
      "outgoing",
      `${transport.name} via ${maskProxy(context.proxyUrl)} -> ${host}`,
    );
  } else {
    logger.debug("outgoing", `${transport.name} -> ${host}`);
  }
  return transport.fetch(url, options, context);
}
