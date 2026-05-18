export type SecuritySeverity = "low" | "medium" | "high";

export type SecurityEnvironment = "local" | "ci";

export interface SecurityIssue {
  category: string;
  description: string;
  severity: SecuritySeverity;
}

export interface SecurityIgnoredIssue extends SecurityIssue {
  allowlistReason: string;
}

export type SecurityCheckStatus = "passed" | "failed" | "ignored";
export type SecurityCheckStandard = "OWASP-inspired" | "Web-Hardening";

export interface SecurityCheckResult {
  id: string;
  name: string;
  description: string;
  standard: SecurityCheckStandard;
  category: string;
  status: SecurityCheckStatus;
  detectedIssues: number;
  ignoredIssues: number;
  ignoredReasons?: string[];
}

export interface SecurityResult {
  url: string;
  timestamp: string;
  env: SecurityEnvironment;
  score: number;
  threshold: number;
  deductions: Record<SecuritySeverity, number>;
  checks: SecurityCheckResult[];
  issues: SecurityIssue[];
  ignoredIssues?: SecurityIgnoredIssue[];
  passed: boolean;
}

export interface SecurityScanConfig {
  minPassingScore?: number;
  outputJsonPath: string;
  outputHtmlPath: string;
}

export interface SecurityAllowlistRule {
  domainPattern?: string;
  pathPattern?: string;
  categories: string[];
  reason?: string;
}

export interface SecurityPolicy {
  environment: SecurityEnvironment;
  minPassingScore: number;
  deductions: Record<SecuritySeverity, number>;
  allowlistRules: SecurityAllowlistRule[];
}
