import { SecurityIssue, SecuritySeverity } from "./types";

const DEFAULT_DEDUCTION_BY_SEVERITY: Record<SecuritySeverity, number> = {
  high: 20,
  medium: 10,
  low: 5,
};

export class SecurityScore {
  static readonly MAX_SCORE = 100;

  static calculate(
    issues: SecurityIssue[],
    deductionBySeverity: Record<SecuritySeverity, number> = DEFAULT_DEDUCTION_BY_SEVERITY,
  ): number {
    const totalDeduction = issues.reduce((sum, issue) => {
      return sum + deductionBySeverity[issue.severity];
    }, 0);

    return Math.max(0, this.MAX_SCORE - totalDeduction);
  }

  static passes(score: number, minPassingScore = 80): boolean {
    return score >= minPassingScore;
  }

  static defaultDeductions(): Record<SecuritySeverity, number> {
    return { ...DEFAULT_DEDUCTION_BY_SEVERITY };
  }
}
