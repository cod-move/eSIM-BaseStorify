import type { SectionDefinition } from "@/lib/storefront/sections/types";
import { esimDestinationTabs, esimHero, esimPlanSelector, esimPopular } from "./destinations";
import { esimDeviceCheck, esimInstallGuide, esimSteps } from "./guides";

/**
 * The eSIM blocks, added to Storify's section registry by patch P1
 * (`lib/storefront/sections/registry.ts`). They can go on any page the page
 * builder edits; names and field labels come from `locales/esim/*.json`
 * (`admin.storeBuilder.sections.<type>`, patch P9).
 */
export const ESIM_SECTIONS: SectionDefinition[] = [
  esimHero,
  esimPopular,
  esimDestinationTabs,
  esimPlanSelector,
  esimSteps,
  esimInstallGuide,
  esimDeviceCheck,
];
