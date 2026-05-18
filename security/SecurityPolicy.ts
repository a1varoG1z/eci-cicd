import fs from "node:fs";
import path from "node:path";
import { SecurityAllowlistRule, SecurityEnvironment, SecurityPolicy } from "./types";

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveEnvironment(): SecurityEnvironment {
  const rawEnv = (process.env.ENV || process.env.NODE_ENV || "local").toLowerCase();
  return rawEnv === "ci" ? "ci" : "local";
}

function loadRulesFromFile(projectRoot: string): SecurityAllowlistRule[] {
  const allowlistPath =
    process.env.SECURITY_ALLOWLIST_FILE || path.join(projectRoot, "security", "allowlist.json");

  if (!fs.existsSync(allowlistPath)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(allowlistPath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SecurityAllowlistRule[]) : [];
  } catch {
    return [];
  }
}

function loadRulesFromEnv(): SecurityAllowlistRule[] {
  const rawRules = process.env.SECURITY_ALLOWLIST_RULES_JSON;
  if (!rawRules) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(rawRules);
    return Array.isArray(parsed) ? (parsed as SecurityAllowlistRule[]) : [];
  } catch {
    return [];
  }
}

function sanitizeRule(rule: SecurityAllowlistRule): SecurityAllowlistRule | null {
  if (!Array.isArray(rule.categories) || rule.categories.length === 0) {
    return null;
  }

  return {
    domainPattern: rule.domainPattern,
    pathPattern: rule.pathPattern,
    categories: rule.categories,
    reason: rule.reason,
  };
}

export class SecurityPolicyResolver {
  static resolve(projectRoot: string): SecurityPolicy {
    const environment = resolveEnvironment();
    const defaultThreshold = environment === "ci" ? 80 : 75;

    const minPassingScore = parseNumber(
      process.env.SECURITY_MIN_SCORE,
      parseNumber(
        environment === "ci"
          ? process.env.SECURITY_MIN_SCORE_CI
          : process.env.SECURITY_MIN_SCORE_LOCAL,
        defaultThreshold,
      ),
    );

    const defaultDeductions =
      environment === "ci"
        ? { high: 20, medium: 10, low: 5 }
        : { high: 15, medium: 7, low: 3 };

    const deductions = {
      high: parseNumber(
        environment === "ci" ? process.env.SECURITY_DEDUCTION_HIGH_CI : process.env.SECURITY_DEDUCTION_HIGH_LOCAL,
        defaultDeductions.high,
      ),
      medium: parseNumber(
        environment === "ci"
          ? process.env.SECURITY_DEDUCTION_MEDIUM_CI
          : process.env.SECURITY_DEDUCTION_MEDIUM_LOCAL,
        defaultDeductions.medium,
      ),
      low: parseNumber(
        environment === "ci" ? process.env.SECURITY_DEDUCTION_LOW_CI : process.env.SECURITY_DEDUCTION_LOW_LOCAL,
        defaultDeductions.low,
      ),
    };

    const allowlistRules = [...loadRulesFromFile(projectRoot), ...loadRulesFromEnv()]
      .map(sanitizeRule)
      .filter((rule): rule is SecurityAllowlistRule => rule !== null);

    return {
      environment,
      minPassingScore,
      deductions,
      allowlistRules,
    };
  }
}
