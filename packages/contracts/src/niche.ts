import { z } from "zod";
import { countryCodeSchema, languageCodeSchema } from "./common";

export const createNicheSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  targetCountry: countryCodeSchema,
  targetLanguage: languageCodeSchema,
  seedKeywords: z.array(z.string().min(2).max(100)).min(1).max(20),
  includeTerms: z.array(z.string().min(1).max(100)).max(50).default([]),
  excludeTerms: z.array(z.string().min(1).max(100)).max(50).default([]),
});

export type CreateNicheInput = z.infer<typeof createNicheSchema>;

export const updateNicheSchema = createNicheSchema
  .partial()
  .extend({ status: z.enum(["active", "paused", "archived"]).optional() });

export const collectNicheSchema = z.object({
  providers: z.array(z.enum(["youtube_data", "google_trends", "google_ads"])).default(["youtube_data"]),
  lookbackDays: z.number().int().min(1).max(365).default(30),
  maxVideosPerKeyword: z.number().int().min(1).max(50).default(25),
  forceRefresh: z.boolean().default(false),
});

export type CollectNicheInput = z.infer<typeof collectNicheSchema>;

export const discoverTopicsSchema = z.object({
  maxTopics: z.number().int().min(1).max(30).default(20),
  forceRefresh: z.boolean().default(false),
});

export type DiscoverTopicsInput = z.infer<typeof discoverTopicsSchema>;
