import path from "node:path";
import { ConsoleMessage, Page } from "@playwright/test";
import { ExternalAsset, SecurityChecks, FormInfo, LocalStorageEntry } from "./SecurityChecks";
import { SecurityPolicyResolver } from "./SecurityPolicy";
import { SecurityReportWriter } from "./SecurityReportWriter";
import { SecurityScore } from "./SecurityScore";
import {
  SecurityAllowlistRule,
  SecurityCheckResult,
  SecurityCheckStandard,
  SecurityIgnoredIssue,
  SecurityIssue,
  SecurityResult,
  SecurityScanConfig,
} from "./types";

interface CheckDefinition {
  id: string;
  name: string;
  description: string;
  standard: SecurityCheckStandard;
  category: string;
  run: () => Promise<SecurityIssue[]> | SecurityIssue[];
}

export class SecurityScanner {
  private readonly page: Page;
  private readonly config: SecurityScanConfig;
  private readonly projectRoot: string;

  constructor(page: Page, config?: Partial<SecurityScanConfig>) {
    this.page = page;

    this.projectRoot = path.resolve(__dirname, "..");
    this.config = {
      outputJsonPath: path.join(this.projectRoot, "reports", "security", "securityScan.json"),
      outputHtmlPath: path.join(this.projectRoot, "reports", "security", "securityDashboard.html"),
      ...config,
    };
  }

  async scan(): Promise<SecurityResult> {
    const policy = SecurityPolicyResolver.resolve(this.projectRoot);
    const currentUrl = this.page.url();
    const timestamp = new Date().toISOString();

    const consoleErrors: string[] = [];
    const onConsole = (message: ConsoleMessage): void => {
      const errorText = SecurityChecks.extractConsoleErrorText(message.type(), message.text());
      if (errorText) {
        consoleErrors.push(errorText);
      }
    };

    const onPageError = (error: Error): void => {
      const message = error.message || String(error);
      consoleErrors.push(message);
    };

    this.page.on("console", onConsole);
    this.page.on("pageerror", onPageError);

    try {
      const [headers, cookies, localStorageEntries, resourceUrls, forms, externalAssets, redirectsHttpToHttps] = await Promise.all([
        this.fetchHeaders(currentUrl),
        this.page.context().cookies(),
        this.getLocalStorageEntries(),
        this.getResourceUrls(),
        this.getFormInfo(),
        this.getExternalAssets(),
        this.checkHttpToHttpsRedirect(currentUrl),
      ]);

      const checkDefinitions: CheckDefinition[] = [
        {
          id: "headers",
          name: "Security Headers",
          description:
            "Comprueba cabeceras HTTP de seguridad (CSP, X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy).",
          standard: "OWASP-inspired",
          category: "headers",
          run: () => SecurityChecks.checkRequiredHeaders(headers),
        },
        {
          id: "cookies",
          name: "Cookie Security",
          description: "Valida que las cookies tengan Secure, HttpOnly y SameSite robusto.",
          standard: "OWASP-inspired",
          category: "cookies",
          run: () => SecurityChecks.checkCookies(cookies),
        },
        {
          id: "local-storage",
          name: "Local Storage Sensitive Data",
          description: "Detecta tokens o datos sensibles persistidos en localStorage.",
          standard: "OWASP-inspired",
          category: "localStorage",
          run: () => SecurityChecks.checkLocalStorage(localStorageEntries),
        },
        {
          id: "mixed-content",
          name: "Mixed Content",
          description: "Busca recursos HTTP cargados dentro de una pagina HTTPS.",
          standard: "OWASP-inspired",
          category: "mixed-content",
          run: () => SecurityChecks.checkMixedContent(currentUrl, resourceUrls),
        },
        {
          id: "clickjacking",
          name: "Clickjacking Protection",
          description: "Verifica proteccion anti-iframe con X-Frame-Options o frame-ancestors.",
          standard: "OWASP-inspired",
          category: "clickjacking",
          run: () => SecurityChecks.checkClickjacking(headers),
        },
        {
          id: "csrf",
          name: "CSRF",
          description: "Detecta formularios POST sin token CSRF.",
          standard: "OWASP-inspired",
          category: "csrf",
          run: () => SecurityChecks.checkCsrfAndFormSecurity(currentUrl, forms).filter((issue) => issue.category === "csrf"),
        },
        {
          id: "xss-probe",
          name: "XSS Probe",
          description: "Intenta una inyeccion XSS basica y valida que no se ejecute.",
          standard: "OWASP-inspired",
          category: "xss-probe",
          run: () => SecurityChecks.probeXss(this.page),
        },
        {
          id: "open-redirect",
          name: "Open Redirect",
          description: "Busca parametros de redireccion que permitan destino externo no validado.",
          standard: "OWASP-inspired",
          category: "open-redirect",
          run: () => SecurityChecks.checkOpenRedirect(currentUrl),
        },
        {
          id: "form-security",
          name: "Form Security",
          description: "Revisa acciones inseguras en formularios y controles de inputs password.",
          standard: "OWASP-inspired",
          category: "form-security",
          run: () => SecurityChecks.checkCsrfAndFormSecurity(currentUrl, forms).filter((issue) => issue.category === "form-security"),
        },
        {
          id: "console-errors",
          name: "Console Errors",
          description: "Recoge errores de consola y runtime de navegador durante el escaneo.",
          standard: "OWASP-inspired",
          category: "console-errors",
          run: () => SecurityChecks.checkConsoleErrors(consoleErrors),
        },
        {
          id: "cors",
          name: "CORS Policy Audit",
          description: "Audita Access-Control-Allow-Origin y Access-Control-Allow-Credentials para detectar configuraciones inseguras.",
          standard: "Web-Hardening",
          category: "cors",
          run: () => SecurityChecks.checkCorsPolicy(headers),
        },
        {
          id: "subresource-integrity",
          name: "Subresource Integrity",
          description: "Valida que recursos externos (script/link) usen atributo integrity.",
          standard: "Web-Hardening",
          category: "subresource-integrity",
          run: () => SecurityChecks.checkSubresourceIntegrity(currentUrl, externalAssets),
        },
        {
          id: "third-party-risk",
          name: "Third-party Script Risk",
          description: "Inventaria dominios de terceros cargados por la pagina y estima riesgo por volumen.",
          standard: "Web-Hardening",
          category: "third-party-risk",
          run: () => SecurityChecks.checkThirdPartyScriptRisk(currentUrl, resourceUrls),
        },
        {
          id: "permissions-policy",
          name: "Permissions-Policy",
          description: "Comprueba la presencia de Permissions-Policy para limitar capacidades del navegador.",
          standard: "Web-Hardening",
          category: "permissions-policy",
          run: () => SecurityChecks.checkPermissionsPolicy(headers),
        },
        {
          id: "cache-control",
          name: "Sensitive Route Cache-Control",
          description: "En rutas sensibles valida directivas de cache seguras (no-store/private).",
          standard: "Web-Hardening",
          category: "cache-control",
          run: () => SecurityChecks.checkCacheControlForSensitiveRoutes(currentUrl, headers),
        },
        {
          id: "tls-https",
          name: "TLS/HTTPS Enforcement",
          description: "Valida redireccion estricta HTTP->HTTPS y coherencia de HSTS/preload.",
          standard: "Web-Hardening",
          category: "tls-https",
          run: () => SecurityChecks.checkTlsRedirectAndHsts({ currentUrl, headers, redirectsHttpToHttps }),
        },
      ];

      const checkIssues = await Promise.all(
        checkDefinitions.map(async (check) => ({
          check,
          issues: await check.run(),
        })),
      );

      const rawIssues = checkIssues.flatMap((entry) => entry.issues);

      const uniqueIssues = this.deduplicateIssues(rawIssues);
      const { keptIssues, ignoredIssues } = this.applyAllowlist(uniqueIssues, currentUrl, policy.allowlistRules);
      const checks = this.buildCheckResults(checkDefinitions, keptIssues, ignoredIssues);

      const score = SecurityScore.calculate(keptIssues, policy.deductions);
      const effectiveThreshold = this.config.minPassingScore ?? policy.minPassingScore;
      const passed = SecurityScore.passes(score, effectiveThreshold);

      const result: SecurityResult = {
        url: currentUrl,
        timestamp,
        env: policy.environment,
        score,
        threshold: effectiveThreshold,
        deductions: policy.deductions,
        checks,
        issues: keptIssues,
        ignoredIssues,
        passed,
      };

      SecurityReportWriter.appendResult(this.config.outputJsonPath, result);
      SecurityReportWriter.writeDashboard(this.config.outputHtmlPath);

      return result;
    } finally {
      this.page.off("console", onConsole);
      this.page.off("pageerror", onPageError);
    }
  }

  private buildCheckResults(
    definitions: CheckDefinition[],
    keptIssues: SecurityIssue[],
    ignoredIssues: SecurityIgnoredIssue[],
  ): SecurityCheckResult[] {
    return definitions.map((definition) => {
      const detected = keptIssues.filter((issue) => issue.category === definition.category).length;
      const ignoredForCheck = ignoredIssues.filter((issue) => issue.category === definition.category);
      const ignored = ignoredForCheck.length;
      const ignoredReasons = Array.from(new Set(ignoredForCheck.map((issue) => issue.allowlistReason))).filter(Boolean);

      let status: SecurityCheckResult["status"] = "passed";
      if (detected > 0) {
        status = "failed";
      } else if (ignored > 0) {
        status = "ignored";
      }

      return {
        id: definition.id,
        name: definition.name,
        description: definition.description,
        standard: definition.standard,
        category: definition.category,
        status,
        detectedIssues: detected,
        ignoredIssues: ignored,
        ignoredReasons,
      };
    });
  }

  private applyAllowlist(
    issues: SecurityIssue[],
    url: string,
    rules: SecurityAllowlistRule[],
  ): { keptIssues: SecurityIssue[]; ignoredIssues: SecurityIgnoredIssue[] } {
    if (rules.length === 0 || issues.length === 0) {
      return { keptIssues: issues, ignoredIssues: [] };
    }

    let parsed: URL | null = null;
    try {
      parsed = new URL(url);
    } catch {
      return { keptIssues: issues, ignoredIssues: [] };
    }

    const keptIssues: SecurityIssue[] = [];
    const ignoredIssues: SecurityIgnoredIssue[] = [];

    for (const issue of issues) {
      const matchedRule = rules.find((rule) => {
        if (!rule.categories.includes(issue.category)) {
          return false;
        }
        return this.matchesRule(rule, parsed as URL);
      });

      if (matchedRule) {
        ignoredIssues.push({
          ...issue,
          allowlistReason: matchedRule.reason || "Ignored by allowlist rule",
        });
      } else {
        keptIssues.push(issue);
      }
    }

    return { keptIssues, ignoredIssues };
  }

  private deduplicateIssues(issues: SecurityIssue[]): SecurityIssue[] {
    const seen = new Set<string>();
    const unique: SecurityIssue[] = [];

    for (const issue of issues) {
      const key = `${issue.category}|${issue.severity}|${issue.description}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      unique.push(issue);
    }

    return unique;
  }

  private matchesRule(rule: SecurityAllowlistRule, parsedUrl: URL): boolean {
    const domainOk = this.matchesDomain(rule.domainPattern, parsedUrl.hostname);
    const pathOk = this.matchesPath(rule.pathPattern, parsedUrl.pathname);
    return domainOk && pathOk;
  }

  private matchesDomain(pattern: string | undefined, hostname: string): boolean {
    if (!pattern || pattern.trim() === "") {
      return true;
    }

    const normalizedPattern = pattern.trim().toLowerCase();
    const normalizedHostname = hostname.toLowerCase();

    if (normalizedPattern.startsWith("*.")) {
      const suffix = normalizedPattern.slice(1);
      return normalizedHostname.endsWith(suffix);
    }

    return normalizedHostname === normalizedPattern || normalizedHostname.endsWith(`.${normalizedPattern}`);
  }

  private matchesPath(pattern: string | undefined, pathname: string): boolean {
    if (!pattern || pattern.trim() === "") {
      return true;
    }

    const cleanPattern = pattern.trim();
    if (cleanPattern.startsWith("regex:")) {
      const regexPattern = cleanPattern.slice("regex:".length);
      try {
        return new RegExp(regexPattern).test(pathname);
      } catch {
        return false;
      }
    }

    return pathname.startsWith(cleanPattern);
  }

  private async fetchHeaders(url: string): Promise<Record<string, string>> {
    try {
      const response = await this.page.request.get(url, { timeout: 15000 });
      return SecurityChecks.normalizeHeaders(response.headers());
    } catch {
      return {};
    }
  }

  private async getLocalStorageEntries(): Promise<LocalStorageEntry[]> {
    return this.page.evaluate(() => {
      return Object.keys(localStorage).map((key) => ({
        key,
        value: localStorage.getItem(key) ?? "",
      }));
    });
  }

  private async getResourceUrls(): Promise<string[]> {
    return this.page.evaluate(() => {
      const perfResourceUrls = performance
        .getEntriesByType("resource")
        .map((entry) => (entry as PerformanceResourceTiming).name)
        .filter(Boolean);

      const domUrls: string[] = [];
      const nodes = document.querySelectorAll("script[src],img[src],link[href],iframe[src],source[src],video[src],audio[src]");
      nodes.forEach((node) => {
        const element = node as HTMLScriptElement | HTMLImageElement | HTMLLinkElement | HTMLIFrameElement | HTMLSourceElement | HTMLVideoElement | HTMLAudioElement;
        const source =
          ("src" in element ? element.src : "") ||
          ("href" in element ? element.href : "");

        if (source) {
          domUrls.push(source);
        }
      });

      return Array.from(new Set([...perfResourceUrls, ...domUrls]));
    });
  }

  private async getFormInfo(): Promise<FormInfo[]> {
    return this.page.evaluate(() => {
      const tokenSelectors = [
        'input[name*="csrf" i]',
        'input[name*="_token" i]',
        'input[name*="authenticity_token" i]',
        'meta[name="csrf-token" i]',
      ];

      const hasGlobalCsrfMeta = tokenSelectors.some((selector) => Boolean(document.querySelector(selector)));

      return Array.from(document.forms).map((form) => {
        const passwordInputs = Array.from(form.querySelectorAll('input[type="password"]')).map((input) => ({
          autocomplete: input.getAttribute("autocomplete"),
          hasMinLength: input.hasAttribute("minlength"),
          hasPattern: input.hasAttribute("pattern"),
        }));

        const hasFormCsrf = tokenSelectors.some((selector) => Boolean(form.querySelector(selector)));

        return {
          action: form.action || "",
          method: (form.method || "get").toLowerCase(),
          hasCsrfToken: hasGlobalCsrfMeta || hasFormCsrf,
          passwordInputs,
        };
      });
    });
  }

  private async getExternalAssets(): Promise<ExternalAsset[]> {
    return this.page.evaluate(() => {
      const assets: ExternalAsset[] = [];

      document.querySelectorAll("script[src]").forEach((node) => {
        const script = node as HTMLScriptElement;
        assets.push({
          url: script.src,
          tag: "script",
          integrity: script.getAttribute("integrity"),
        });
      });

      document.querySelectorAll("link[rel='stylesheet'][href]").forEach((node) => {
        const link = node as HTMLLinkElement;
        assets.push({
          url: link.href,
          tag: "link",
          integrity: link.getAttribute("integrity"),
        });
      });

      return assets;
    });
  }

  private async checkHttpToHttpsRedirect(currentUrl: string): Promise<boolean> {
    if (!currentUrl.startsWith("https://")) {
      return false;
    }

    try {
      const httpsUrl = new URL(currentUrl);
      const httpUrl = new URL(currentUrl);
      httpUrl.protocol = "http:";

      const response = await this.page.request.get(httpUrl.toString(), {
        timeout: 15000,
        failOnStatusCode: false,
        maxRedirects: 0,
      });

      const status = response.status();
      const location = response.headers()["location"] || "";
      const isRedirectStatus = [301, 302, 307, 308].includes(status);
      const redirectsToHttps = location.startsWith("https://") && location.includes(httpsUrl.hostname);
      return isRedirectStatus && redirectsToHttps;
    } catch {
      return false;
    }
  }
}
