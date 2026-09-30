import { FAVICON_SIZE } from "../../favicon/size";
import type { FaviconContext } from "../../types/extension";
import { asString, getSettings } from "../../utils/settings/plugin-settings";
import { outgoingFetch, parseOutgoingTransport } from "../../utils/net/outgoing";
import { useCache } from "../../utils/cache/cache";
import { getRandomUserAgent } from "../../utils/net/user-agents";


export const buildFaviconContext = async (
  providerId: string,
): Promise<FaviconContext> => {
  const stored = await getSettings(providerId);
  const transportName = parseOutgoingTransport(
    asString(stored.outgoingTransport) || undefined,
  );
  return {
    fetch: (url, init) =>
      outgoingFetch(
        url,
        (init ?? {}) as Parameters<typeof outgoingFetch>[1],
        transportName,
      ),
    userAgent: getRandomUserAgent(),
    size: FAVICON_SIZE,
    useCache,
  };
};
