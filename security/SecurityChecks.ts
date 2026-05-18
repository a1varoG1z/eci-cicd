import { Cookie, Page } from "@playwright/test";
import { SecurityIssue } from "./types";

interface LocalStorageEntry {
  key: string;
  value: string;
}

interface PasswordInputInfo {
  autocomplete: string | null;
  hasMinLength: boolean;
  hasPattern: boolean;
}

interface FormInfo {
  action: string;
  method: string;
  hasCsrfToken: boolean;
  passwordInputs: PasswordInputInfo[];
}

interface ExternalAsset {
  url: string;
  tag: "script" | "link";
  integrity: string | null;
}

interface TlsAuditInput {
  currentUrl: string;
  headers: Record<string, string>;
  redirectsHttpToHttps: boolean;
}

export class SecurityChecks {
  static normalizeHeaders(headers: Record<string, string>): Record<string, string> {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      normalized[key.toLowerCase()] = value;
    }
    return normalized;
  }

  static checkRequiredHeaders(headers: Record<string, string>): SecurityIssue[] {
    const issues: SecurityIssue[] = [];
    const required: Array<{ key: string; severity: "medium" | "high" }> = [
      { key: "content-security-policy", severity: "high" },
      { key: "x-frame-options", severity: "high" },
      { key: "strict-transport-security", severity: "high" },
      { key: "x-content-type-options", severity: "medium" },
      { key: "referrer-policy", severity: "medium" },
    ];

    for (const item of required) {
      if (!headers[item.key]) {
        issues.push({
          category: "headers",
          description: `Missing ${item.key} header`,
          severity: item.severity,
        });
      }
    }

    return issues;
  }

  static checkClickjacking(headers: Record<string, string>): SecurityIssue[] {
    const issues: SecurityIssue[] = [];
    const xFrameOptions = headers["x-frame-options"];
    const csp = headers["content-security-policy"];

    const hasXfo = Boolean(xFrameOptions);
    const hasFrameAncestors = Boolean(csp && /frame-ancestors/i.test(csp));
    if (!hasXfo && !hasFrameAncestors) {
      issues.push({
        category: "clickjacking",
        description: "No X-Frame-Options and no CSP frame-ancestors policy detected",
        severity: "high",
      });
    }

    return issues;
  }

  static checkCookies(cookies: Cookie[]): SecurityIssue[] {
    const issues: SecurityIssue[] = [];

    for (const cookie of cookies) {
      if (!cookie.secure) {
        issues.push({
          category: "cookies",
          description: `Cookie "${cookie.name}" is not Secure`,
          severity: "high",
        });
      }

      if (!cookie.httpOnly) {
        issues.push({
          category: "cookies",
          description: `Cookie "${cookie.name}" is not HttpOnly`,
          severity: "high",
        });
      }

      if (!cookie.sameSite || cookie.sameSite === "None") {
        issues.push({
          category: "cookies",
          description: `Cookie "${cookie.name}" has weak SameSite policy (${cookie.sameSite ?? "undefined"})`,
          severity: "medium",
        });
      }
    }

    return issues;
  }

  static checkLocalStorage(entries: LocalStorageEntry[]): SecurityIssue[] {
    const issues: SecurityIssue[] = [];
    const sensitiveKeyPattern = /(token|auth|jwt|secret|password|api[-_]?key|bearer|refresh[-_]?token)/i;
    const sensitiveValuePattern = /(bearer\s+[a-z0-9\-._~+/]+=*|eyJ[a-z0-9\-_=]+\.[a-z0-9\-_=]+\.[a-z0-9\-_=]+|[a-f0-9]{40,})/i;

    for (const entry of entries) {
      if (sensitiveKeyPattern.test(entry.key)) {
        issues.push({
          category: "localStorage",
          description: `Sensitive key detected in localStorage: ${entry.key}`,
          severity: "high",
        });
      }

      if (sensitiveValuePattern.test(entry.value)) {
        issues.push({
          category: "localStorage",
          description: `Sensitive value pattern detected in localStorage key: ${entry.key}`,
          severity: "medium",
        });
      }
    }

    return issues;
  }

  static checkMixedContent(pageUrl: string, resourceUrls: string[]): SecurityIssue[] {
    if (!pageUrl.startsWith("https://")) {
      return [];
    }

    const insecureResources = resourceUrls.filter((resourceUrl) => resourceUrl.startsWith("http://"));
    if (insecureResources.length === 0) {
      return [];
    }

    return [
      {
        category: "mixed-content",
        description: `Detected ${insecureResources.length} HTTP resource(s) in HTTPS page`,
        severity: "high",
      },
    ];
  }

  static checkCsrfAndFormSecurity(pageUrl: string, forms: FormInfo[]): SecurityIssue[] {
    const issues: SecurityIssue[] = [];
    const isHttpsPage = pageUrl.startsWith("https://");

    for (const form of forms) {
      const method = form.method.toLowerCase();
      if (method === "post" && !form.hasCsrfToken) {
        issues.push({
          category: "csrf",
          description: `POST form without CSRF token (action: ${form.action || "current-page"})`,
          severity: "high",
        });
      }

      if (isHttpsPage && form.action.startsWith("http://")) {
        issues.push({
          category: "form-security",
          description: `Insecure form action over HTTP: ${form.action}`,
          severity: "high",
        });
      }

      for (const passwordInput of form.passwordInputs) {
        const ac = (passwordInput.autocomplete ?? "").toLowerCase();
        const hasGoodAutocomplete = ac === "current-password" || ac === "new-password" || ac === "on";
        if (!hasGoodAutocomplete) {
          issues.push({
            category: "form-security",
            description: "Password input missing recommended autocomplete attribute",
            severity: "medium",
          });
        }

        if (!passwordInput.hasMinLength && !passwordInput.hasPattern) {
          issues.push({
            category: "form-security",
            description: "Password input missing minlength/pattern constraint",
            severity: "low",
          });
        }
      }
    }

    return issues;
  }

  static checkOpenRedirect(url: string): SecurityIssue[] {
    const issues: SecurityIssue[] = [];
    const redirectParams = ["redirect", "redirect_uri", "return", "returnUrl", "next", "url"];

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return issues;
    }

    for (const param of redirectParams) {
      const value = parsedUrl.searchParams.get(param);
      if (!value) {
        continue;
      }

      const externalAbsolute = /^https?:\/\//i.test(value) && !value.startsWith(parsedUrl.origin);
      if (externalAbsolute) {
        issues.push({
          category: "open-redirect",
          description: `Potential open redirect parameter: ${param}=${value}`,
          severity: "high",
        });
      }
    }

    return issues;
  }

  static checkConsoleErrors(consoleErrors: string[]): SecurityIssue[] {
    if (consoleErrors.length === 0) {
      return [];
    }

    return [
      {
        category: "console-errors",
        description: `Detected ${consoleErrors.length} console error(s) while scanning`,
        severity: "low",
      },
    ];
  }

  static checkCorsPolicy(headers: Record<string, string>): SecurityIssue[] {
    const issues: SecurityIssue[] = [];
    const acao = headers["access-control-allow-origin"];
    const acac = headers["access-control-allow-credentials"];

    if (!acao) {
      return issues;
    }

    if (acao.trim() === "*") {
      issues.push({
        category: "cors",
        description: "Access-Control-Allow-Origin is wildcard (*)",
        severity: "medium",
      });
    }

    if (acao.trim() === "*" && acac && acac.toLowerCase() === "true") {
      issues.push({
        category: "cors",
        description: "CORS misconfiguration: wildcard origin with credentials enabled",
        severity: "high",
      });
    }

    return issues;
  }

  static checkSubresourceIntegrity(pageUrl: string, assets: ExternalAsset[]): SecurityIssue[] {
    const issues: SecurityIssue[] = [];

    let origin = "";
    try {
      origin = new URL(pageUrl).origin;
    } catch {
      return issues;
    }

    const externalMissingSri = assets.filter((asset) => {
      if (!asset.url) {
        return false;
      }
      const isExternal = !asset.url.startsWith(origin);
      const missingIntegrity = !asset.integrity || asset.integrity.trim() === "";
      return isExternal && missingIntegrity;
    });

    if (externalMissingSri.length > 0) {
      issues.push({
        category: "subresource-integrity",
        description: `External assets without integrity attribute: ${externalMissingSri.length}`,
        severity: "low",
      });
    }

    return issues;
  }

  static checkThirdPartyScriptRisk(pageUrl: string, resourceUrls: string[]): SecurityIssue[] {
    const issues: SecurityIssue[] = [];

    let originHost = "";
    try {
      originHost = new URL(pageUrl).hostname;
    } catch {
      return issues;
    }

    const thirdPartyHosts = Array.from(
      new Set(
        resourceUrls
          .map((resourceUrl) => {
            try {
              return new URL(resourceUrl).hostname;
            } catch {
              return "";
            }
          })
          .filter((host) => host && host !== originHost && !host.endsWith(`.${originHost}`)),
      ),
    );

    if (thirdPartyHosts.length === 0) {
      return issues;
    }

    const severity = thirdPartyHosts.length > 20 ? "medium" : "low";
    issues.push({
      category: "third-party-risk",
      description: `Third-party domains loaded by page: ${thirdPartyHosts.length}`,
      severity,
    });

    return issues;
  }

  static checkPermissionsPolicy(headers: Record<string, string>): SecurityIssue[] {
    const permissionsPolicy = headers["permissions-policy"];
    if (permissionsPolicy) {
      return [];
    }

    return [
      {
        category: "permissions-policy",
        description: "Missing Permissions-Policy header",
        severity: "low",
      },
    ];
  }

  static checkCacheControlForSensitiveRoutes(pageUrl: string, headers: Record<string, string>): SecurityIssue[] {
    const issues: SecurityIssue[] = [];

    let pathname = "";
    try {
      pathname = new URL(pageUrl).pathname.toLowerCase();
    } catch {
      return issues;
    }

    const sensitiveRoutePattern = /(login|account|perfil|profile|checkout|cart|carrito|auth|password|pedido)/;
    if (!sensitiveRoutePattern.test(pathname)) {
      return issues;
    }

    const cacheControl = (headers["cache-control"] || "").toLowerCase();
    const hasSafeCacheControl = cacheControl.includes("no-store") || cacheControl.includes("private");

    if (!cacheControl) {
      issues.push({
        category: "cache-control",
        description: "Sensitive route without Cache-Control header",
        severity: "medium",
      });
    } else if (!hasSafeCacheControl) {
      issues.push({
        category: "cache-control",
        description: "Sensitive route should use no-store or private Cache-Control",
        severity: "medium",
      });
    }

    return issues;
  }

  static checkTlsRedirectAndHsts(input: TlsAuditInput): SecurityIssue[] {
    const issues: SecurityIssue[] = [];
    const { currentUrl, headers, redirectsHttpToHttps } = input;

    const isHttps = currentUrl.startsWith("https://");
    if (!isHttps) {
      issues.push({
        category: "tls-https",
        description: "Page is not served over HTTPS",
        severity: "high",
      });
      return issues;
    }

    if (!redirectsHttpToHttps) {
      issues.push({
        category: "tls-https",
        description: "HTTP endpoint does not redirect strictly to HTTPS",
        severity: "high",
      });
    }

    const hsts = (headers["strict-transport-security"] || "").toLowerCase();
    if (!hsts) {
      // HSTS missing is already covered in required headers check.
      return issues;
    }

    const maxAgeMatch = hsts.match(/max-age=(\d+)/i);
    const maxAge = maxAgeMatch ? Number(maxAgeMatch[1]) : 0;
    const hasIncludeSubDomains = hsts.includes("includesubdomains");
    const hasPreload = hsts.includes("preload");

    if (maxAge > 0 && maxAge < 31536000) {
      issues.push({
        category: "tls-https",
        description: "HSTS max-age should be >= 31536000 for long-term protection",
        severity: "low",
      });
    }

    if (!hasIncludeSubDomains) {
      issues.push({
        category: "tls-https",
        description: "HSTS should include includeSubDomains for coherent policy",
        severity: "low",
      });
    }

    if (hasPreload && (!hasIncludeSubDomains || maxAge < 31536000)) {
      issues.push({
        category: "tls-https",
        description: "HSTS preload token is inconsistent with includeSubDomains/max-age requirements",
        severity: "medium",
      });
    }

    return issues;
  }

  static async probeXss(page: Page): Promise<SecurityIssue[]> {
    const payloadExecuted = await page.evaluate(async () => {
      const probeFlag = "__xssProbeExecuted";
      (window as unknown as Record<string, unknown>)[probeFlag] = false;

      const probe = document.createElement("div");
      probe.style.display = "none";
      probe.innerHTML = `<img src="x" onerror="window.${probeFlag}=true">`;
      document.body.appendChild(probe);

      await new Promise((resolve) => window.setTimeout(resolve, 200));

      const executed = Boolean((window as unknown as Record<string, unknown>)[probeFlag]);
      probe.remove();
      delete (window as unknown as Record<string, unknown>)[probeFlag];
      return executed;
    });

    if (!payloadExecuted) {
      return [];
    }

    return [
      {
        category: "xss-probe",
        description: "Simple XSS payload executed in DOM context",
        severity: "high",
      },
    ];
  }

  static extractConsoleErrorText(type: string, text: string): string | null {
    if (type !== "error") {
      return null;
    }
    return text;
  }
}

export type { ExternalAsset, FormInfo, LocalStorageEntry, TlsAuditInput };
