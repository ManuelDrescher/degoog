import type { StoreItem } from "../../../types/store-tab";

export function pluginTypeLabel(type: string): string {
  if (type === "command") return "Bang";
  if (type === "slot") return "Slot";
  if (type === "search-result-tab") return "Search tab";
  if (type === "searchBarAction") return "Search bar";
  return type.charAt(0).toUpperCase() + type.slice(1).replace(/-/g, " ");
}

export function engineTypeLabel(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

const t = window.scopedT("core");

type StoreItemType = StoreItem["type"];

export const STORE_ITEM_TYPES: readonly StoreItemType[] = [
  "plugin",
  "theme",
  "engine",
  "transport",
  "autocomplete",
  "favicon",
  "shortcut",
];

const STORE_TYPE_KEYS: Record<StoreItemType, { filter: string; single: string }> = {
  plugin: { filter: "filter-plugins", single: "type-plugin" },
  theme: { filter: "filter-themes", single: "type-theme" },
  engine: { filter: "filter-engines", single: "type-engine" },
  transport: { filter: "filter-transports", single: "type-transport" },
  autocomplete: { filter: "filter-autocomplete", single: "type-autocomplete" },
  favicon: { filter: "filter-favicon", single: "type-favicon" },
  shortcut: { filter: "filter-shortcuts", single: "type-shortcut" },
};

const _isStoreType = (type: string): type is StoreItemType =>
  Object.prototype.hasOwnProperty.call(STORE_TYPE_KEYS, type);

const _capitalise = (type: string): string =>
  type.charAt(0).toUpperCase() + type.slice(1);

export const storeTypeLabel = (type: string): string =>
  _isStoreType(type)
    ? t(`settings-page.store.${STORE_TYPE_KEYS[type].single}`)
    : _capitalise(type);

export const storeFilterLabel = (type: StoreItemType): string =>
  t(`settings-page.store.${STORE_TYPE_KEYS[type].filter}`);

export const storeAllFilterLabel = (): string =>
  t("settings-page.store.filter-extensions");
