import fs from "node:fs";
import path from "node:path";
import { SecurityResult } from "./types";

export class SecurityReportWriter {
  static readResults(filePath: string): SecurityResult[] {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const data: unknown = JSON.parse(raw);
      if (Array.isArray(data)) {
        return data as SecurityResult[];
      }
      if (data && typeof data === "object") {
        return [data as SecurityResult];
      }
      return [];
    } catch {
      return [];
    }
  }

  static appendResult(filePath: string, result: SecurityResult): void {
    const reportDir = path.dirname(filePath);
    fs.mkdirSync(reportDir, { recursive: true });

    // Mantener solo el ultimo resultado para evitar confusion con historicos.
    fs.writeFileSync(filePath, JSON.stringify([result], null, 2), "utf-8");
  }

  static writeDashboard(htmlPath: string): void {
    const reportDir = path.dirname(htmlPath);
    fs.mkdirSync(reportDir, { recursive: true });
    const logoDataUrl = this.readLogoBase64(path.resolve(__dirname, ".."));
    const jsonPath = path.join(reportDir, "securityScan.json");
    const embeddedScans = this.readResults(jsonPath);
    fs.writeFileSync(htmlPath, this.dashboardTemplate(logoDataUrl, embeddedScans), "utf-8");
  }

  private static readLogoBase64(projectRoot: string): string {
    const logoPath = path.join(projectRoot, "docs", "logo-izertis.png");
    try {
      const data = fs.readFileSync(logoPath);
      return `data:image/png;base64,${data.toString("base64")}`;
    } catch {
      return "";
    }
  }

  private static dashboardTemplate(logoDataUrl: string, embeddedScans: SecurityResult[]): string {
    const logoHtml = logoDataUrl
      ? `<img src="${logoDataUrl}" alt="Izertis" style="height:44px;object-fit:contain;" />`
      : "";
    const safeEmbedded = JSON.stringify(embeddedScans).replace(/</g, "\\u003c");

    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Informe de Seguridad - Playwright</title>
  <style>
    :root {
      --surface: #ffffff;
      --text: #0f172a;
      --muted: #475569;
      --border: #dbe3ef;
      --pass: #166534;
      --fail: #b91c1c;
      --low: #2563eb;
      --medium: #b7791f;
      --high: #c53030;
      --accent: #0a4b88;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Segoe UI, Arial, sans-serif;
      background: linear-gradient(160deg, #eef3fb 0%, #f8fbff 45%, #f3f6fb 100%);
      color: var(--text);
      padding: 20px;
    }
    .wrap {
      max-width: 1560px;
      margin: 0 auto;
      display: grid;
      gap: 16px;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      box-shadow: 0 18px 42px rgba(15, 23, 42, 0.08);
      padding: 18px;
    }
    .head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 10px;
    }
    h1 {
      margin: 0 0 6px;
      color: var(--accent);
      letter-spacing: 0.2px;
    }
    .muted {
      color: var(--muted);
      margin: 0;
      font-size: 14px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px;
      margin-top: 12px;
    }
    .stat {
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px;
      background: #f8fbff;
      position: relative;
    }
    .stat-info {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 17px;
      height: 17px;
      border-radius: 50%;
      border: 1.5px solid #0a4b88;
      background: #fff;
      color: #0a4b88;
      font-size: 11px;
      font-weight: 700;
      line-height: 14px;
      text-align: center;
      cursor: default;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      z-index: 1;
    }
    .stat-info:hover .stat-tooltip {
      display: block;
    }
    .stat-tooltip {
      display: none;
      position: absolute;
      top: 22px;
      right: 0;
      width: 260px;
      background: #fff;
      border: 1px solid #0a4b88;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 12px;
      color: #333;
      box-shadow: 0 4px 16px rgba(0,0,0,0.13);
      z-index: 100;
      text-align: left;
      font-weight: 400;
      white-space: normal;
      line-height: 1.5;
    }
    .stat-label {
      margin: 0 0 4px;
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .stat-value {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
      font-size: 14px;
    }
    th, td {
      text-align: left;
      padding: 10px 8px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    th {
      background: #f6faff;
      color: #16324a;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    .score-pass { color: var(--pass); font-weight: 700; }
    .score-fail { color: var(--fail); font-weight: 700; }
    .score-pass-bg { background: #e9f9ef; }
    .score-fail-bg { background: #fff1f2; }
    .status {
      display: inline-block;
      padding: 3px 9px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.2px;
    }
    .status.pass { color: #166534; background: #e9f9ef; }
    .status.fail { color: #b91c1c; background: #fff1f2; }
    .status.ignored { color: #7a4a00; background: #fff7e8; }
    .legend { margin-top: 8px; color: var(--muted); font-size: 13px; line-height: 1.4; }
    .issue {
      margin-bottom: 6px;
      line-height: 1.35;
    }
    .sev {
      display: inline-block;
      font-size: 12px;
      font-weight: 700;
      color: #fff;
      border-radius: 999px;
      padding: 2px 8px;
      margin-right: 6px;
      min-width: 58px;
      text-align: center;
    }
    .sev-low { background: var(--low); }
    .sev-medium { background: var(--medium); }
    .sev-high { background: var(--high); }
    .table-wrap {
      overflow-x: auto;
      max-height: 540px;
      overflow-y: auto;
    }
    @media (max-width: 800px) {
      body { padding: 12px; }
      .card { padding: 12px; }
      th, td { font-size: 13px; }
      .head { flex-direction: column; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="card">
      <div class="head">
        <div>
          <h1>Informe de Seguridad</h1>
          <p class="muted">Resultado generado con Playwright sobre controles OWASP-inspired y Web-Hardening.</p>
        </div>
        <div>${logoHtml}</div>
      </div>
      <p class="muted">Fuente de datos: reports/security/securityScan.json</p>
      <div class="stats">
        <div class="stat"><p class="stat-label">Score actual</p><p id="statScore" class="stat-value">0</p><span class="stat-info">?<span class="stat-tooltip">El score comienza en <strong>100</strong> y se resta una penalizacion por cada issue detectado:<br><br>&bull; Severidad <strong>alta</strong>: &minus;15 puntos<br>&bull; Severidad <strong>media</strong>: &minus;7 puntos<br>&bull; Severidad <strong>baja</strong>: &minus;3 puntos<br><br>Los issues ignorados por allowlist <strong>no penalizan</strong>. El umbral minimo para pasar es <strong>${embeddedScans[0]?.threshold ?? 75}</strong> puntos.</span></span></div>
        <div class="stat"><p class="stat-label">Checks pass</p><p id="statPass" class="stat-value">0</p></div>
        <div class="stat"><p class="stat-label">Checks fail</p><p id="statFail" class="stat-value">0</p></div>
        <div class="stat"><p class="stat-label">Checks ignored</p><p id="statIgnored" class="stat-value">0</p></div>
      </div>
    </section>

    <section class="card">
      <h2 style="margin:0 0 8px;color:#0a4b88;">Que checks ejecuta esta prueba</h2>
      <p class="muted">Cada fila representa un control de seguridad realizado en la pagina actual y su resultado.</p>
      <p class="legend">Estado ignored: el check detecto hallazgos, pero han sido excluidos por allowlist configurada para ese dominio/ruta.</p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Check</th>
              <th>Marco</th>
              <th>Que valida</th>
              <th>Estado</th>
              <th>Issues detectados</th>
              <th>Issues ignorados</th>
              <th>Motivo ignore</th>
            </tr>
          </thead>
          <tbody id="checkRows"></tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h2 style="margin:0 0 8px;color:#0a4b88;">Resultado de la ultima ejecucion</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>URL</th>
              <th>Score</th>
              <th>Issues</th>
            </tr>
          </thead>
          <tbody id="scanRows"></tbody>
        </table>
      </div>
    </section>
  </div>

  <script>
    const EMBEDDED_SCANS = ${safeEmbedded};
    const CHECK_CATALOG = [
      { id: "headers", name: "Security Headers", standard: "OWASP-inspired", category: "headers", description: "Comprueba CSP, X-Frame-Options, HSTS, X-Content-Type-Options y Referrer-Policy." },
      { id: "cookies", name: "Cookie Security", standard: "OWASP-inspired", category: "cookies", description: "Valida flags Secure, HttpOnly y SameSite en cookies." },
      { id: "local-storage", name: "Local Storage Sensitive Data", standard: "OWASP-inspired", category: "localStorage", description: "Detecta almacenamiento local de tokens o secretos." },
      { id: "mixed-content", name: "Mixed Content", standard: "OWASP-inspired", category: "mixed-content", description: "Detecta recursos HTTP dentro de paginas HTTPS." },
      { id: "clickjacking", name: "Clickjacking Protection", standard: "OWASP-inspired", category: "clickjacking", description: "Verifica defensa anti-iframe con X-Frame-Options o frame-ancestors." },
      { id: "csrf", name: "CSRF", standard: "OWASP-inspired", category: "csrf", description: "Busca formularios POST sin token CSRF." },
      { id: "xss-probe", name: "XSS Probe", standard: "OWASP-inspired", category: "xss-probe", description: "Prueba inyeccion XSS basica y valida que no se ejecute." },
      { id: "open-redirect", name: "Open Redirect", standard: "OWASP-inspired", category: "open-redirect", description: "Detecta parametros de redireccion potencialmente inseguros." },
      { id: "form-security", name: "Form Security", standard: "OWASP-inspired", category: "form-security", description: "Revisa acciones de formulario inseguras y atributos de password." },
      { id: "console-errors", name: "Console Errors", standard: "OWASP-inspired", category: "console-errors", description: "Captura errores de consola/runtime durante la prueba." },
      { id: "cors", name: "CORS Policy Audit", standard: "Web-Hardening", category: "cors", description: "Audita ACAO/ACAC para detectar CORS inseguro." },
      { id: "subresource-integrity", name: "Subresource Integrity", standard: "Web-Hardening", category: "subresource-integrity", description: "Valida integrity en scripts/estilos externos." },
      { id: "third-party-risk", name: "Third-party Script Risk", standard: "Web-Hardening", category: "third-party-risk", description: "Inventaria dominios de terceros y estima riesgo por volumen." },
      { id: "permissions-policy", name: "Permissions-Policy", standard: "Web-Hardening", category: "permissions-policy", description: "Comprueba cabecera Permissions-Policy." },
      { id: "cache-control", name: "Sensitive Route Cache-Control", standard: "Web-Hardening", category: "cache-control", description: "Valida no-store/private en rutas sensibles." },
      { id: "tls-https", name: "TLS/HTTPS Enforcement", standard: "Web-Hardening", category: "tls-https", description: "Valida redireccion HTTP->HTTPS y coherencia HSTS/preload." }
    ];

    async function loadScans() {
      try {
        const response = await fetch("./securityScan.json", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("No se pudo cargar securityScan.json");
        }
        const data = await response.json();
        return Array.isArray(data) ? data : [];
      } catch {
        // Fallback para apertura local (file://) donde fetch puede estar bloqueado.
        return Array.isArray(EMBEDDED_SCANS) ? EMBEDDED_SCANS : [];
      }
    }

    function safeText(value) {
      if (value === undefined || value === null) return "";
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    function renderStats(scan) {
      const checks = deriveChecks(scan);
      const pass = checks.filter(c => c.status === "passed").length;
      const fail = checks.filter(c => c.status === "failed").length;
      const ignored = checks.filter(c => c.status === "ignored").length;
      const score = scan ? Number(scan.score || 0) : 0;

      document.getElementById("statScore").textContent = String(score.toFixed ? score.toFixed(1) : score);
      document.getElementById("statPass").textContent = String(pass);
      document.getElementById("statFail").textContent = String(fail);
      document.getElementById("statIgnored").textContent = String(ignored);
    }

    function renderTable(scan) {
      const body = document.getElementById("scanRows");
      body.innerHTML = "";

      if (!scan) {
        const tr = document.createElement("tr");
        tr.innerHTML = '<td colspan="4">No hay datos de seguridad disponibles.</td>';
        body.appendChild(tr);
        return;
      }

      const tr = document.createElement("tr");
      const score = Number(scan.score || 0);
      const threshold = Number(scan.threshold || 80);
      const scoreClass = score >= threshold ? "score-pass score-pass-bg" : "score-fail score-fail-bg";

      const issues = Array.isArray(scan.issues) ? scan.issues : [];
      const issuesHtml = issues.length === 0
        ? "No issues"
        : issues.map(issue => {
            const sev = safeText(issue.severity || "low");
            const cat = safeText(issue.category || "unknown");
            const desc = safeText(issue.description || "");
            return '<div class="issue"><span class="sev sev-' + sev + '">' + sev + '</span><strong>' + cat + '</strong>: ' + desc + '</div>';
          }).join("");

      tr.innerHTML =
        '<td>' + safeText(scan.timestamp) + '</td>' +
        '<td>' + safeText(scan.url) + '</td>' +
        '<td class="' + scoreClass + '">' + score + ' / ' + threshold + '</td>' +
        '<td>' + issuesHtml + '</td>';
      body.appendChild(tr);
    }

    function statusBadge(status) {
      if (status === "failed") return '<span class="status fail">fail</span>';
      if (status === "ignored") return '<span class="status ignored">ignored</span>';
      return '<span class="status pass">pass</span>';
    }

    function deriveChecks(scan) {
      if (Array.isArray(scan && scan.checks) && scan.checks.length > 0) {
        return scan.checks.map(check => {
          const hasReasons = Array.isArray(check.ignoredReasons) && check.ignoredReasons.length > 0;
          if (hasReasons) {
            return check;
          }
          const ignored = Array.isArray(scan && scan.ignoredIssues) ? scan.ignoredIssues : [];
          const fallbackReasons = Array.from(new Set(
            ignored
              .filter(i => i.category === check.category)
              .map(i => i.allowlistReason)
              .filter(Boolean)
          ));
          return { ...check, ignoredReasons: fallbackReasons };
        });
      }

      const issues = Array.isArray(scan && scan.issues) ? scan.issues : [];
      const ignored = Array.isArray(scan && scan.ignoredIssues) ? scan.ignoredIssues : [];
      return CHECK_CATALOG.map((check) => {
        const detected = issues.filter(i => i.category === check.category).length;
        const ignoredForCheck = ignored.filter(i => i.category === check.category);
        const ignoredCount = ignoredForCheck.length;
        const ignoredReasons = Array.from(new Set(ignoredForCheck.map(i => i.allowlistReason).filter(Boolean)));
        const status = detected > 0 ? "failed" : (ignoredCount > 0 ? "ignored" : "passed");
        return {
          id: check.id,
          name: check.name,
          standard: check.standard,
          description: check.description,
          category: check.category,
          status,
          detectedIssues: detected,
          ignoredIssues: ignoredCount,
          ignoredReasons,
        };
      });
    }

    function renderChecks(scan) {
      const body = document.getElementById("checkRows");
      body.innerHTML = "";

      if (!scan) {
        const tr = document.createElement("tr");
        tr.innerHTML = '<td colspan="5">No hay datos de checks disponibles.</td>';
        body.appendChild(tr);
        return;
      }

      const checks = deriveChecks(scan);
      checks.forEach((check) => {
        const reasonText = Array.isArray(check.ignoredReasons) && check.ignoredReasons.length > 0
          ? check.ignoredReasons.map(r => safeText(r)).join("<br>")
          : "-";
        const tr = document.createElement("tr");
        tr.innerHTML =
          '<td><strong>' + safeText(check.name) + '</strong></td>' +
          '<td>' + safeText(check.standard || "-") + '</td>' +
          '<td>' + safeText(check.description) + '</td>' +
          '<td>' + statusBadge(check.status) + '</td>' +
          '<td>' + Number(check.detectedIssues || 0) + '</td>' +
          '<td>' + Number(check.ignoredIssues || 0) + '</td>' +
          '<td>' + reasonText + '</td>';
        body.appendChild(tr);
      });
    }

    (async function init() {
      try {
        const scans = await loadScans();
        const latest = scans.length > 0 ? scans[scans.length - 1] : null;
        renderStats(latest);
        renderChecks(latest);
        renderTable(latest);
      } catch (error) {
        console.error(error);
        alert("No se pudo cargar el reporte de seguridad.");
      }
    })();
  </script>
</body>
</html>`;
  }
}
