import type { ScoredResult } from "../../../shared/search-types";
import type { AutocompleteCacheItem } from "../cache/cache";
import { signData, verifyData } from "../security/server-key";
import { getBasePath, getBaseUrl } from "./base-url";

const PROXY_PATHS = ["/api/proxy/image", "/api/proxy/favicon"];
const RESULT_SEAL_PREFIX = "result:";

const _ownPrefixes = (): string[] => {
  const baseUrl = getBaseUrl();
  const origins = [getBasePath()];
  if (/^https?:\/\//i.test(baseUrl)) origins.push(baseUrl);
  return origins;
};

const _isOwnProxyUrl = (thumb: string): boolean =>
  _ownPrefixes().some((origin) => {
    if (!thumb.startsWith(`${origin}/`)) return false;
    const path = thumb.slice(origin.length).split(/[?#]/)[0];
    return PROXY_PATHS.includes(path);
  });

const _signThumb = (thumb: string | undefined): string | undefined =>
  thumb && !_isOwnProxyUrl(thumb) ? buildSignedProxyUrl(thumb) : thumb;

export const buildSignedProxyUrl = (url: string): string => {
  const sig = signData(url);
  return `${getBasePath()}/api/proxy/image?url=${encodeURIComponent(url)}&sig=${sig}`;
};

export const verifyProxyUrl = (url: string, sig: string): boolean =>
  verifyData(url, sig);

export const sealResultUrl = (url: string): string =>
  signData(`${RESULT_SEAL_PREFIX}${url}`);

export const isSealedResult = (result: unknown): result is ScoredResult => {
  if (!result || typeof result !== "object") return false;
  const { url, seal } = result as { url?: unknown; seal?: unknown };
  return (
    typeof url === "string" &&
    typeof seal === "string" &&
    verifyData(`${RESULT_SEAL_PREFIX}${url}`, seal)
  );
};

export function signResultThumbnails(results: ScoredResult[]): ScoredResult[] {
  return results.map((r) => ({
    ...r,
    seal: sealResultUrl(r.url),
    ...(r.thumbnail ? { thumbnail: _signThumb(r.thumbnail) } : {}),
    ...(r.imageUrl ? { imageUrl: _signThumb(r.imageUrl) } : {}),
  }));
}

export const signSuggestionThumbnails = (
  items: AutocompleteCacheItem[],
): AutocompleteCacheItem[] =>
  items.map((item) =>
    item.rich?.thumbnail
      ? { ...item, rich: { ...item.rich, thumbnail: _signThumb(item.rich.thumbnail) } }
      : item,
  );

const MD_IMAGE_RE = /(!\[[^\]]*\]\(\s*<?)(https?:\/\/[^\s)>]+)/gi;
const HTML_IMG_RE = /(<img\b[^>]*?\bsrc\s*=\s*["'])(https?:\/\/[^"']+)/gi;

export const proxyMarkdownImages = (markdown: string): string =>
  markdown
    .replace(MD_IMAGE_RE, (_m, open: string, url: string) => `${open}${buildSignedProxyUrl(url)}`)
    .replace(HTML_IMG_RE, (_m, open: string, url: string) => `${open}${buildSignedProxyUrl(url)}`);

const HTML_MEDIA_SRC_RE =
  /(<(?:img|source|video|audio|input)\b[^>]*?\b(?:src|poster)\s*=\s*["'])(https?:\/\/[^"']+)/gi;
const HTML_SRCSET_RE = /(<(?:img|source)\b[^>]*?\bsrcset\s*=\s*)(["'])([^"']*)\2/gi;

const _proxyAttrUrl = (raw: string): string => {
  const url = raw.replace(/&amp;/g, "&");
  return _isOwnProxyUrl(url) ? raw : buildSignedProxyUrl(url);
};

const _proxySrcset = (srcset: string): string =>
  srcset
    .split(",")
    .map((candidate) =>
      candidate.replace(/^(\s*)(https?:\/\/\S+)/i, (_m, lead: string, url: string) => `${lead}${_proxyAttrUrl(url)}`),
    )
    .join(",");

export const proxyHtmlImages = (html: string): string =>
  html
    .replace(HTML_MEDIA_SRC_RE, (_m, open: string, url: string) => `${open}${_proxyAttrUrl(url)}`)
    .replace(HTML_SRCSET_RE, (_m, open: string, quote: string, set: string) => `${open}${quote}${_proxySrcset(set)}${quote}`);
