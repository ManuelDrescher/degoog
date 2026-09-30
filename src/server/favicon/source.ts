import { hasFaviconProviders } from "../extensions/favicon/registry";
import { peekInstanceSettings } from "../utils/settings/server-settings";
import { faviconStoreConfig } from "./store/config";

export const hasFaviconSource = (): boolean => {
  if (hasFaviconProviders()) return true;
  const settings = peekInstanceSettings();
  return settings ? faviconStoreConfig(settings).enabled : false;
};
