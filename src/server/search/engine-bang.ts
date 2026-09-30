import { getEngineSearchType, singleEngineConfig } from "../extensions/engines/catalog";
import type { EngineConfig } from "../types/search";
import { isDisabled } from "../utils/settings/plugin-settings";

export interface EngineBangPlan {
  engines: EngineConfig;
  searchType: string;
}

export const isEngineBangAllowed = async (
  engineId: string,
  requested: EngineConfig,
): Promise<boolean> => !!requested[engineId] && !(await isDisabled(engineId));

export const planEngineBang = async (
  engineId: string,
  requested: EngineConfig,
  preferredType?: string,
): Promise<EngineBangPlan | null> => {
  if (!(await isEngineBangAllowed(engineId, requested))) return null;
  return {
    engines: singleEngineConfig(engineId),
    searchType: (await getEngineSearchType(engineId, preferredType)) ?? "web",
  };
};
