import { z } from "zod";
import { countryCodeSchema, languageCodeSchema } from "./common";

export const memberRoles = ["owner", "operator", "reviewer", "viewer"] as const;
export const memberRoleSchema = z.enum(memberRoles);
export type MemberRole = z.infer<typeof memberRoleSchema>;

/** 스펙 6.4의 역할별 허용 행위. API 라우트가 이 표를 참조한다. */
const rolePermissions = {
  owner: [
    "workspace:update",
    "integration:write",
    "score_config:write",
    "niche:write",
    "topic:write",
    "topic:decide",
    "qa:write",
    "publish:approve",
    "read",
  ],
  operator: ["niche:write", "topic:write", "topic:decide", "read"],
  reviewer: ["qa:write", "publish:approve", "topic:decide", "read"],
  viewer: ["read"],
} as const satisfies Record<MemberRole, readonly string[]>;

export type Permission = (typeof rolePermissions)[MemberRole][number];

export function roleHasPermission(role: MemberRole, permission: Permission): boolean {
  return (rolePermissions[role] as readonly string[]).includes(permission);
}

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "소문자, 숫자, 하이픈만 쓸 수 있습니다."),
  timezone: z.string().min(1).default("Asia/Seoul"),
  defaultLocale: z.string().min(2).default("ko-KR"),
});

export const updateWorkspaceSettingsSchema = z.object({
  targetCountries: z.array(countryCodeSchema).min(1).max(20).optional(),
  contentLanguages: z.array(languageCodeSchema).min(1).max(20).optional(),
  defaultCurrency: z.string().length(3).optional(),
  dailyAiBudget: z.number().nonnegative().nullable().optional(),
  monthlyAiBudget: z.number().nonnegative().nullable().optional(),
  featureFlags: z.record(z.string(), z.boolean()).optional(),
});
