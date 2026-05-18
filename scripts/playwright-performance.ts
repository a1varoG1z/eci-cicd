import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { chromium } from "@playwright/test";

type Thresholds = {
  ttfbMsMax: number;
  dclMsMax: number;
  loadMsMax: number;
  firstPaintMsMax: number;
  firstContentfulPaintMsMax: number;
  requestsMax: number;
  bytesMax: number;
  lcpMsMax: number;
  clsMax: number;
};

type MetricSeries = {
  runs: number[];
  median: number | null;
  p95: number | null;
};

type PerfMetricsSample = {
  ttfbMs: number;
  domContentLoadedMs: number;
  loadMs: number;
  requestCount: number;
  transferSizeBytes: number;
  lcpMs: number | null;
  cls: number | null;
  firstPaintMs: number | null;
  firstContentfulPaintMs: number | null;
};

type PerfMetrics = {
  ttfbMs: MetricSeries;
  domContentLoadedMs: MetricSeries;
  loadMs: MetricSeries;
  requestCount: MetricSeries;
  transferSizeBytes: MetricSeries;
  lcpMs: MetricSeries;
  cls: MetricSeries;
  firstPaintMs: MetricSeries;
  firstContentfulPaintMs: MetricSeries;
};

type RuntimeInfo = {
  headless: boolean;
  userAgent: string;
  webdriver: boolean | null;
  languages: string[];
};

type PerfReport = {
  timestamp: string;
  env: string;
  url: string;
  launchProfile: string;
  runtime: RuntimeInfo;
  httpStatus: number | null;
  thresholds: Thresholds;
  metrics: PerfMetrics;
  checks: Record<string, { value: number | null; threshold: string; ok: boolean }>;
  passed: boolean;
};

type PerfRunSampleReport = Omit<PerfReport, "metrics" | "checks" | "passed"> & {
  metrics: PerfMetricsSample;
};

type PerfKpisJsonReport = {
  generatedAt: string;
  env: string;
  targetUrls: string[];
  results: PerfReport[];
  failedTargets: string[];
};

type HistoryRun = {
  runId: string;
  generatedAt: string;
  env: string;
  targetUrls: string[];
  failedTargets: string[];
  results: PerfReport[];
};

type HistoryStore = {
  runs: HistoryRun[];
};

type WaitUntilState = "load" | "domcontentloaded" | "networkidle" | "commit";

type LaunchProfile = {
  name: string;
  channel?: "chrome";
  args: string[];
};

function readNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return fallback;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function p95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function toMetricSeries(values: Array<number | null | undefined>): MetricSeries {
  const finiteValues = values
    .map((value) => (typeof value === "number" ? value : Number.NaN))
    .filter((value) => Number.isFinite(value));

  if (finiteValues.length === 0) {
    return { runs: [], median: null, p95: null };
  }

  return {
    runs: finiteValues,
    median: median(finiteValues),
    p95: p95(finiteValues),
  };
}

function readMetricMedian(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (value && typeof value === "object" && "median" in value) {
    const medianValue = Number((value as { median?: unknown }).median);
    return Number.isFinite(medianValue) ? medianValue : null;
  }
  return null;
}

function getMetricMedian(report: PerfReport, key: keyof PerfMetrics): number | null {
  return readMetricMedian(report.metrics?.[key]);
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cleanPreviousReportArtifacts(reportsDir: string): void {
  const entries = fs.readdirSync(reportsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name === "performance-history.json") continue;
    const filePath = path.join(reportsDir, entry.name);
    if (entry.name.endsWith(".json")) {
      fs.rmSync(filePath, { force: true });
    }
  }
}

function writeKpisJsonReport(reportsDir: string, payload: PerfKpisJsonReport): void {
  const jsonPath = path.join(reportsDir, "performance-kpis.json");
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf-8");
}

function flattenHistoryRuns(store: HistoryStore): Array<PerfReport & { _runId: string; _env: string }> {
  const rows: Array<PerfReport & { _runId: string; _env: string }> = [];
  for (const run of store.runs) {
    for (const result of run.results) {
      rows.push({ ...result, _runId: run.runId, _env: run.env });
    }
  }
  return rows;
}

function buildHistoryOptions(values: string[], allLabel: string): string {
  const options = Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right, "es"));
  return [`<option value="">${allLabel}</option>`, ...options.map((value) => `<option value="${value}">${value}</option>`)].join("");
}

function formatHistoryShortDate(timestamp: string): string {
  const date = new Date(timestamp);
  return `${date.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" })} ${date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
}

function buildHistorySummaryHtml(rows: Array<PerfReport & { _runId: string; _env: string }>): string {
  if (rows.length === 0) {
    return "<article class=\"summary-card\"><p class=\"t\">Sin datos</p><p class=\"n\">0</p><p class=\"s\">No hay ejecuciones almacenadas</p></article>";
  }

  const passed = rows.filter((row) => row.passed).length;
  const failed = rows.length - passed;
  const urls = new Set(rows.map((row) => row.url)).size;
  const runs = new Set(rows.map((row) => row._runId)).size;
  const passRate = rows.length === 0 ? 0 : (passed / rows.length) * 100;
  const avg = (selector: (row: PerfReport) => number | null | undefined): string => {
    const values = rows.map(selector).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return values.length === 0 ? "N/A" : `${Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)} ms`;
  };

  const cards = [
    { title: "Ejecuciones totales", value: String(rows.length), subtitle: `${runs} run(s)` },
    { title: "URLs distintas", value: String(urls), subtitle: "en el histórico" },
    { title: "PASS", value: String(passed), subtitle: `${passRate.toFixed(1)}%` },
    { title: "FAIL", value: String(failed), subtitle: `${(100 - passRate).toFixed(1)}%` },
    { title: "TTFB medio", value: avg((row) => getMetricMedian(row, "ttfbMs")), subtitle: "promedio histórico" },
    { title: "Load medio", value: avg((row) => getMetricMedian(row, "loadMs")), subtitle: "promedio histórico" },
    { title: "LCP medio", value: avg((row) => getMetricMedian(row, "lcpMs")), subtitle: "promedio histórico" },
  ];

  return cards
    .map(
      (card) =>
        `<article class="summary-card"><p class="t">${card.title}</p><p class="n">${card.value}</p><p class="s">${card.subtitle}</p></article>`,
    )
    .join("");
}

function buildHistoryTableRowsHtml(rows: Array<PerfReport & { _runId: string; _env: string }>): string {
  if (rows.length === 0) {
    return '<tr><td colspan="14" class="no-data">No hay datos para los filtros seleccionados.</td></tr>';
  }

  const sortedRows = [...rows].sort((left, right) => String(right.timestamp).localeCompare(String(left.timestamp)));
  const formatCell = (failed: boolean, value: string): string => `<td${failed ? ' class="ko"' : ""}>${value}</td>`;

  return sortedRows
    .map((row) => {
      const checks = row.checks || {};
      const ttfb = getMetricMedian(row, "ttfbMs");
      const dcl = getMetricMedian(row, "domContentLoadedMs");
      const load = getMetricMedian(row, "loadMs");
      const firstPaint = getMetricMedian(row, "firstPaintMs");
      const firstContentfulPaint = getMetricMedian(row, "firstContentfulPaintMs");
      const lcp = getMetricMedian(row, "lcpMs");
      const cls = getMetricMedian(row, "cls");
      const requests = getMetricMedian(row, "requestCount");
      const bytes = getMetricMedian(row, "transferSizeBytes");
      return [
        "<tr>",
        `<td>${formatHistoryShortDate(row.timestamp)}</td>`,
        `<td>${row.url || "N/A"}</td>`,
        `<td>${row.env || row._env || "N/A"}</td>`,
        `<td>${row.launchProfile || "N/A"}</td>`,
        `<td><span class="pill ${row.passed ? "pass" : "fail"}">${row.passed ? "PASS" : "FAIL"}</span></td>`,
        formatCell(Boolean(checks.ttfb && !checks.ttfb.ok), ttfb === null ? "N/A" : `${Math.round(ttfb)} ms`),
        formatCell(Boolean(checks.domContentLoaded && !checks.domContentLoaded.ok), dcl === null ? "N/A" : `${Math.round(dcl)} ms`),
        formatCell(Boolean(checks.load && !checks.load.ok), load === null ? "N/A" : `${Math.round(load)} ms`),
        formatCell(Boolean(checks.firstPaint && !checks.firstPaint.ok), firstPaint === null ? "N/A" : `${Math.round(firstPaint)} ms`),
        formatCell(
          Boolean(checks.firstContentfulPaint && !checks.firstContentfulPaint.ok),
          firstContentfulPaint === null ? "N/A" : `${Math.round(firstContentfulPaint)} ms`,
        ),
        formatCell(Boolean(checks.lcp && !checks.lcp.ok), lcp === null ? "N/A" : `${Math.round(lcp)} ms`),
        formatCell(Boolean(checks.cls && !checks.cls.ok), cls === null ? "N/A" : cls.toFixed(3)),
        formatCell(
          Boolean(checks.requests && !checks.requests.ok),
          requests === null ? "N/A" : Math.round(requests).toLocaleString("es-ES"),
        ),
        formatCell(Boolean(checks.bytes && !checks.bytes.ok), bytes === null ? "N/A" : Math.round(bytes).toLocaleString("es-ES")),
        "</tr>",
      ].join("");
    })
    .join("");
}

function readLogoBase64(projectRoot: string): string {
  const logoPath = path.join(projectRoot, "Izertis_logo-1024x313.png");
  try {
    const data = fs.readFileSync(logoPath);
    return `data:image/png;base64,${data.toString("base64")}`;
  } catch {
    return "";
  }
}

function writeSelfContainedHtmlReport(reportsDir: string, payload: PerfKpisJsonReport, logoDataUrl: string): void {
  const htmlPath = path.join(reportsDir, "performance-kpis.html");
  const safeJson = JSON.stringify(payload).replace(/</g, "\\u003c");
  const logoHtml = logoDataUrl
    ? `<img src="${logoDataUrl}" alt="Izertis" style="height:44px;object-fit:contain;" />`
    : "";

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Informe de Performance - Playwright</title>
<style>
  :root{
    --surface:#ffffff;
    --text:#0f172a;
    --muted:#475569;
    --border:#dbe3ef;
    --accent:#0a4b88;
    --nav:#f7faff;
    --ok-bg:#e9f9ef;
    --ok:#166534;
    --ko-bg:#fff1f2;
    --ko:#b91c1c;
  }
  *{box-sizing:border-box}
  body{margin:0;background:linear-gradient(160deg,#eef3fb 0%,#f8fbff 45%,#f3f6fb 100%);color:var(--text);font-family:Segoe UI,Arial,sans-serif}
  .wrap{max-width:1560px;margin:20px auto;padding:0 12px 24px}
  .report{background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:0 18px 42px rgba(15,23,42,.08);overflow:visible}
  .head{display:flex;justify-content:space-between;align-items:flex-start;padding:22px 24px;border-bottom:1px solid var(--border);background:linear-gradient(180deg,#ffffff 0%,#f8fbff 100%)}
  .title{margin:0;font-size:22px;font-weight:800;letter-spacing:.2px;color:#0b2239}
  .subtitle{margin:6px 0 0;color:var(--muted);font-size:14px}
  .head-right{display:flex;flex-direction:column;align-items:flex-end;gap:10px}
  .pill{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.4px}
  .pill.pass{background:var(--ok-bg);color:var(--ok)}
  .pill.fail{background:var(--ko-bg);color:var(--ko)}
  .layout{display:grid;grid-template-columns:320px minmax(0,1fr);min-height:620px}
  .sidebar{border-right:1px solid var(--border);background:var(--nav);padding:16px;position:sticky;top:0;align-self:start;max-height:calc(100vh - 60px);overflow:auto}
  .nav-title{font-size:12px;font-weight:700;letter-spacing:.5px;color:#64748b;text-transform:uppercase;margin:2px 0 10px}
  .nav-list{display:grid;gap:8px}
  .nav-btn{width:100%;text-align:left;border:1px solid var(--border);background:#fff;border-radius:10px;padding:10px 12px;color:#0f172a;font-weight:600;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:10px}
  .nav-btn.active{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent);background:#eef6ff;color:#073861}
  .nav-btn .label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .nav-badges{display:inline-flex;gap:6px;align-items:center}
  .badge{display:inline-block;padding:2px 7px;border-radius:999px;font-size:11px;font-weight:700}
  .badge.pass{background:var(--ok-bg);color:var(--ok)}
  .badge.fail{background:var(--ko-bg);color:var(--ko)}
  .badge.count{background:#eef2ff;color:#334155}
  .content{padding:0 0 20px}
  .meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;padding:16px 24px 6px}
  .meta .item{background:#f8fbff;border:1px solid var(--border);border-radius:10px;padding:10px 12px}
  .meta .k{display:block;font-size:12px;color:var(--muted);margin-bottom:4px}
  .meta .v{font-weight:700;font-size:14px;color:#0b2239;word-break:break-word}
  .summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;padding:0 24px}
  .summary-card{border:1px solid var(--border);border-radius:10px;background:#fff;padding:10px 12px}
  .summary-card .t{font-size:12px;color:var(--muted);margin:0 0 6px}
  .summary-card .n{font-size:24px;font-weight:800;color:#0b2239;margin:0}
  .summary-card .s{font-size:12px;color:#64748b;margin:6px 0 0}
  .summary-card.chart{display:flex;align-items:center;justify-content:center;padding:14px}
  .donut{width:132px;height:132px;border-radius:50%;position:relative;background:conic-gradient(var(--ok) 0 calc(var(--pass) * 1%),var(--ko) 0 calc((var(--pass) + var(--fail)) * 1%),#e2e8f0 0 100%);margin:auto}
  .donut::after{content:'';position:absolute;inset:18px;border-radius:50%;background:#fff;box-shadow:inset 0 0 0 1px var(--border)}
  .donut-center{position:absolute;inset:0;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
  .donut-center .big{font-size:24px;font-weight:800;color:#0b2239;line-height:1}
  .donut-center .small{font-size:11px;font-weight:700;color:#64748b;letter-spacing:.4px}
  .section{padding:16px 24px 22px}
  .section h2{margin:0 0 12px;font-size:16px;color:#0b2239}
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;overflow:visible}
  .kpi{border:1px solid var(--border);border-radius:10px;background:#fff;padding:12px;overflow:visible}
  .kpi-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
  .kpi-name{font-size:13px;font-weight:700;color:#1e293b}
  .help{position:relative;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#e7eef8;color:#0a4b88;font-weight:800;font-size:12px;cursor:help}
  .help .tip{position:absolute;left:50%;bottom:130%;transform:translateX(-50%);width:min(280px,calc(100vw - 48px));padding:8px 10px;border-radius:8px;background:#0f172a;color:#f8fafc;font-size:12px;line-height:1.35;box-shadow:0 10px 24px rgba(2,6,23,.35);opacity:0;visibility:hidden;transition:opacity .15s ease;z-index:50}
  .help:hover .tip{opacity:1;visibility:visible}
  .kpi-value{font-size:22px;font-weight:800;line-height:1.1;color:#0b2239}
  .kpi-th{font-size:12px;color:var(--muted);margin-top:5px}
  .kpi-series{margin-top:10px;display:grid;gap:8px}
  .kpi-series-row{display:grid;grid-template-columns:54px minmax(0,1fr);gap:8px;align-items:start;font-size:12px;color:#334155}
  .kpi-series-label{font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.3px}
  .kpi-runs{display:flex;flex-wrap:wrap;gap:6px}
  .kpi-run{display:inline-flex;align-items:center;padding:3px 7px;border-radius:999px;background:#f8fafc;border:1px solid #dbe3ef;color:#0f172a}
  .kpi-run.median{background:#ecfeff;border-color:#67e8f9;color:#155e75;font-weight:800}
  .kpi-note{margin-top:2px;font-size:11px;color:#64748b}
  .state{display:inline-block;margin-top:8px;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:700}
  .state.pass{background:var(--ok-bg);color:var(--ok)}
  .state.fail{background:var(--ko-bg);color:var(--ko)}
  table{width:100%;border-collapse:collapse}
  th,td{border:1px solid var(--border);padding:8px;text-align:left;font-size:13px}
  th{background:#f7faff;color:#1e293b}
  .ok{color:var(--ok);font-weight:700}
  .ko{color:var(--ko);font-weight:700}
  .muted{color:var(--muted)}
  .metrics td,.metrics th{white-space:nowrap}
  .table-scroll{width:100%;overflow-x:auto}
  .metrics{min-width:1240px}
  @media (max-width:1440px){
    .wrap{max-width:1320px}
    .layout{grid-template-columns:280px minmax(0,1fr)}
    .metrics{min-width:1100px}
  }
  @media (max-width:1240px){
    .layout{grid-template-columns:1fr}
    .sidebar{position:relative;max-height:none;border-right:none;border-bottom:1px solid var(--border)}
    .metrics{min-width:980px}
  }
  @media (max-width:1024px){
    .wrap{margin:14px auto;padding:0 10px 18px}
    .head{padding:16px 18px}
    .section{padding:14px 18px 18px}
    .meta{padding:14px 18px 4px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
    .summary-grid{padding:0 18px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
    .kpis{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
    .metrics{min-width:860px}
  }
  @media (max-width:768px){
    .head{flex-direction:column;gap:12px}
    .head-right{align-items:flex-start;width:100%}
    .title{font-size:20px}
    .subtitle{font-size:13px}
    .pill{font-size:12px;padding:5px 10px}
    .sidebar{padding:12px}
    .nav-list{grid-template-columns:1fr}
    .nav-btn{padding:9px 10px;font-size:13px}
    .section h2{font-size:15px}
    .summary-card .n{font-size:20px}
    th,td{font-size:12px;padding:7px}
    .metrics{min-width:760px}
  }
  @media (max-width:520px){
    .wrap{margin:8px auto;padding:0 8px 14px}
    .report{border-radius:10px}
    .head{padding:12px 12px 10px}
    .meta{padding:10px 12px 2px;grid-template-columns:1fr}
    .meta .item{padding:9px 10px}
    .summary-grid{padding:0 12px;grid-template-columns:1fr}
    .section{padding:12px}
    .donut{width:116px;height:116px}
    .donut::after{inset:16px}
    .kpis{grid-template-columns:1fr}
    .kpi{padding:10px}
    .kpi-value{font-size:20px}
    .help .tip{left:0;transform:none;bottom:125%;width:min(260px,calc(100vw - 28px))}
    .table-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
    .metrics{min-width:680px}
  }
</style>
</head>
<body>
<div class="wrap">
  <article class="report">
    <header class="head">
      <div>
        <h1 class="title">Informe de Performance</h1>
        <p class="subtitle">Resultado generado con Playwright sobre métricas de experiencia de carga.</p>
      </div>
      <div class="head-right">
        <div id="resultPill" class="pill fail">Sin datos</div>
        <div>${logoHtml}</div>
      </div>
    </header>
    <div class="layout">
      <aside class="sidebar">
        <div class="nav-title">Navegación</div>
        <div class="nav-list" id="navList"></div>
      </aside>

      <main class="content">
        <section class="meta">
          <div class="item"><span class="k">Fecha</span><span id="mTimestamp" class="v">-</span></div>
          <div class="item"><span class="k">Entorno</span><span id="mEnv" class="v">-</span></div>
          <div class="item"><span class="k">Resultados disponibles</span><span id="mCount" class="v">-</span></div>
          <div class="item"><span class="k">URLs objetivo</span><span id="mTargets" class="v">-</span></div>
          <div class="item"><span class="k">URLs fallidas</span><span id="mFailed" class="v">-</span></div>
          <div class="item"><span class="k">Vista activa</span><span id="mView" class="v">Resumen</span></div>
        </section>

        <section class="section" id="summarySection">
          <h2>Resumen global</h2>
          <div class="summary-grid" id="summaryCards"></div>
          <div class="table-scroll" style="margin-top:12px;">
            <table>
              <thead><tr><th>Metrica</th><th>Fallos</th><th>Tasa de fallo</th><th>Peor desviacion</th></tr></thead>
              <tbody id="summaryMetricRows"></tbody>
            </table>
          </div>
        </section>

        <section class="section" id="detailSection">
          <h2>KPIs principales</h2>
          <div class="kpis" id="kpis"></div>
        </section>

        <section class="section" id="checksSection">
          <h2>Detalle de comprobaciones</h2>
          <div class="table-scroll">
            <table>
              <thead><tr><th>KPI</th><th>Valor</th><th>Umbral</th><th>Estado</th></tr></thead>
              <tbody id="checkRows"></tbody>
            </table>
          </div>
          <p class="muted" style="margin:10px 0 0;">Fuente de datos embebida. Archivo complementario: performance-kpis.json</p>
        </section>

        <section class="section" id="executionsSection">
          <h2>Ejecuciones</h2>
          <div class="table-scroll">
            <table class="metrics">
              <thead>
                <tr>
                  <th>Timestamp</th><th>URL</th><th>Perfil</th><th>Resultado</th>
                  <th>TTFB</th><th>DCL</th><th>Load</th><th>FP</th><th>FCP</th><th>LCP</th><th>CLS</th><th>Requests</th><th>Bytes</th>
                </tr>
              </thead>
              <tbody id="resultRows"></tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  </article>
</div>

<script>
  const KPI_HELP = {
    ttfb: 'Time To First Byte: tiempo hasta que el navegador recibe el primer byte de respuesta del servidor.',
    domContentLoaded: 'DCL: tiempo hasta que el HTML ha sido parseado y el DOM esta listo.',
    load: 'Load: tiempo hasta que se dispara window.load, con recursos principales cargados.',
    firstPaint: 'First Paint: tiempo hasta que el navegador pinta por primera vez cualquier pixel en pantalla.',
    firstContentfulPaint: 'First Contentful Paint: tiempo hasta que se renderiza el primer contenido (texto, imagen o canvas).',
    lcp: 'Largest Contentful Paint: tiempo de renderizado del elemento visible mas grande.',
    cls: 'Cumulative Layout Shift: estabilidad visual acumulada; cuanto menor, mejor.',
    requests: 'Numero total de recursos de red descargados por la pagina.',
    bytes: 'Volumen total transferido por red para cargar la pagina (en bytes).'
  };

  const reportData = ${safeJson};
  const state = { view: 'summary' };

  function fmtValue(value, name) {
    if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
    if (name === 'cls') return Number(value).toFixed(3);
    if (name === 'bytes' || name === 'requests') return String(Math.round(Number(value)));
    return String(Math.round(Number(value))) + ' ms';
  }

  function unique(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function pct(part, total) {
    if (!total) return '0.0%';
    return ((part / total) * 100).toFixed(1) + '%';
  }

  function parseThreshold(checkName, report) {
    const th = report && report.thresholds ? report.thresholds : {};
    if (checkName === 'ttfb') return Number(th.ttfbMsMax);
    if (checkName === 'domContentLoaded') return Number(th.dclMsMax);
    if (checkName === 'load') return Number(th.loadMsMax);
    if (checkName === 'firstPaint') return Number(th.firstPaintMsMax);
    if (checkName === 'firstContentfulPaint') return Number(th.firstContentfulPaintMsMax);
    if (checkName === 'requests') return Number(th.requestsMax);
    if (checkName === 'bytes') return Number(th.bytesMax);
    if (checkName === 'lcp') return Number(th.lcpMsMax);
    if (checkName === 'cls') return Number(th.clsMax);
    return NaN;
  }

  function metricCell(report, checkName, value, valueName) {
    const failed = report && report.checks && report.checks[checkName] && report.checks[checkName].ok === false;
    const klass = failed ? ' class="ko"' : '';
    return '<td' + klass + '>' + fmtValue(value, valueName) + '</td>';
  }

  function metricKeyForCheck(checkName) {
    if (checkName === 'ttfb') return 'ttfbMs';
    if (checkName === 'domContentLoaded') return 'domContentLoadedMs';
    if (checkName === 'load') return 'loadMs';
    if (checkName === 'firstPaint') return 'firstPaintMs';
    if (checkName === 'firstContentfulPaint') return 'firstContentfulPaintMs';
    if (checkName === 'requests') return 'requestCount';
    if (checkName === 'bytes') return 'transferSizeBytes';
    if (checkName === 'lcp') return 'lcpMs';
    if (checkName === 'cls') return 'cls';
    return null;
  }

  function readMetricValue(report, key) {
    if (!report || !report.metrics) return null;
    const raw = report.metrics[key];
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'object' && Number.isFinite(Number(raw.median))) return Number(raw.median);
    return null;
  }

  function readMetricSeries(report, checkName) {
    const key = metricKeyForCheck(checkName);
    if (!key || !report || !report.metrics) return null;
    const raw = report.metrics[key];
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return { runs: [raw], median: raw, p95: raw };
    }
    const runs = Array.isArray(raw.runs)
      ? raw.runs.map((value) => Number(value)).filter((value) => Number.isFinite(value))
      : [];
    return {
      runs: runs,
      median: Number.isFinite(Number(raw.median)) ? Number(raw.median) : null,
      p95: Number.isFinite(Number(raw.p95)) ? Number(raw.p95) : null,
    };
  }

  function buildRunsMarkup(name, series) {
    if (!series || !series.runs || !series.runs.length) {
      return '<div class="kpi-series"><div class="kpi-series-row"><span class="kpi-series-label">Runs</span><span>N/A</span></div></div>';
    }

    const sorted = series.runs.slice().sort((left, right) => left - right);
    const mid = Math.floor(sorted.length / 2);
    const medianIndexes = sorted.length % 2 !== 0 ? [mid] : [mid - 1, mid];
    const runsHtml = sorted
      .map((value, index) => '<span class="kpi-run' + (medianIndexes.indexOf(index) >= 0 ? ' median' : '') + '">' + fmtValue(value, name) + '</span>')
      .join('');
    const evenNote = sorted.length % 2 === 0 && sorted.length > 1
      ? '<div class="kpi-note">La mediana es el promedio de los dos valores resaltados.</div>'
      : '';

    return '<div class="kpi-series">' +
      '<div class="kpi-series-row"><span class="kpi-series-label">Runs</span><div><div class="kpi-runs">' + runsHtml + '</div>' + evenNote + '</div></div>' +
      '<div class="kpi-series-row"><span class="kpi-series-label">Median</span><span>' + fmtValue(series.median, name) + '</span></div>' +
      '<div class="kpi-series-row"><span class="kpi-series-label">P95</span><span>' + fmtValue(series.p95, name) + '</span></div>' +
    '</div>';
  }

  function latestByUrl(results) {
    const byUrl = {};
    results.forEach((r) => {
      if (!r || !r.url) return;
      const prev = byUrl[r.url];
      if (!prev || String(r.timestamp || '') > String(prev.timestamp || '')) {
        byUrl[r.url] = r;
      }
    });
    return byUrl;
  }

  function buildNav(urls) {
    const navList = document.getElementById('navList');
    if (!navList) return;
    navList.innerHTML = '';

    const latestMap = latestByUrl(Array.isArray(reportData.results) ? reportData.results : []);

    const summaryBtn = document.createElement('button');
    summaryBtn.className = 'nav-btn' + (state.view === 'summary' ? ' active' : '');
    summaryBtn.innerHTML = '<span class="label">Resumen</span>';
    summaryBtn.addEventListener('click', () => {
      state.view = 'summary';
      renderReport();
    });
    navList.appendChild(summaryBtn);

    urls.forEach((url) => {
      const btn = document.createElement('button');
      btn.className = 'nav-btn' + (state.view === url ? ' active' : '');
      btn.title = url;

      const latest = latestMap[url];
      const failCount = Object.values((latest && latest.checks) || {}).filter((c) => c && !c.ok).length;
      const statusClass = latest && latest.passed ? 'pass' : 'fail';
      const statusText = latest && latest.passed ? 'PASS' : 'FAIL';

      btn.innerHTML =
        '<span class="label">' + url + '</span>' +
        '<span class="nav-badges">' +
        '<span class="badge ' + statusClass + '">' + statusText + '</span>' +
        '<span class="badge count">' + failCount + '</span>' +
        '</span>';

      btn.addEventListener('click', () => {
        state.view = url;
        renderReport();
      });
      navList.appendChild(btn);
    });
  }

  function buildKpiCard(name, check, report) {
    const card = document.createElement('article');
    card.className = 'kpi';
    const stateClass = check.ok ? 'pass' : 'fail';
    const series = readMetricSeries(report, name);
    card.innerHTML =
      '<div class="kpi-head">' +
      '<span class="kpi-name">' + name + '</span>' +
      '<span class="help">?<span class="tip">' + (KPI_HELP[name] || 'Definicion no disponible.') + '</span></span>' +
      '</div>' +
      '<div class="kpi-value">' + fmtValue(check.value, name) + '</div>' +
      '<div class="kpi-th">Umbral: ' + check.threshold + '</div>' +
      buildRunsMarkup(name, series) +
      '<span class="state ' + stateClass + '">' + (check.ok ? 'PASS' : 'FAIL') + '</span>';
    return card;
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function renderSummary(results) {
    const summaryCards = document.getElementById('summaryCards');
    const summaryMetricRows = document.getElementById('summaryMetricRows');
    if (!summaryCards || !summaryMetricRows) return;

    summaryCards.innerHTML = '';
    summaryMetricRows.innerHTML = '';

    const latestMap = latestByUrl(results);
    const latestResults = Object.values(latestMap);
    const totalUrls = latestResults.length;
    const passedUrls = latestResults.filter((r) => r.passed).length;
    const failedUrls = totalUrls - passedUrls;
    const passedPct = totalUrls ? (passedUrls / totalUrls) * 100 : 0;
    const failedPct = totalUrls ? (failedUrls / totalUrls) * 100 : 0;

    const metricAgg = {};
    latestResults.forEach((r) => {
      Object.entries(r.checks || {}).forEach(([k, check]) => {
        if (!metricAgg[k]) {
          metricAgg[k] = { fails: 0, total: 0, worstOver: 0 };
        }
        metricAgg[k].total += 1;
        if (!check.ok) {
          metricAgg[k].fails += 1;
          const threshold = parseThreshold(k, r);
          const value = Number(check.value);
          if (Number.isFinite(threshold) && threshold > 0 && Number.isFinite(value)) {
            const over = (value - threshold) / threshold;
            metricAgg[k].worstOver = Math.max(metricAgg[k].worstOver, over);
          }
        }
      });
    });

    let mostFailedName = '-';
    let mostFailedCount = -1;
    let worstMarginName = '-';
    let worstMargin = -1;
    Object.entries(metricAgg).forEach(([k, v]) => {
      if (v.fails > mostFailedCount) {
        mostFailedCount = v.fails;
        mostFailedName = k;
      }
      if (v.worstOver > worstMargin) {
        worstMargin = v.worstOver;
        worstMarginName = k;
      }
    });

    const hasAnyFail = Object.values(metricAgg).some((v) => v.fails > 0);

    const cards = [
      { t: 'URLs evaluadas', n: String(totalUrls), s: 'Basado en ultima ejecucion por URL' },
      { t: 'URLs en PASS', n: String(passedUrls), s: pct(passedUrls, Math.max(totalUrls, 1)) },
      { t: 'URLs en FAIL', n: String(failedUrls), s: pct(failedUrls, Math.max(totalUrls, 1)) },
      { t: 'KPI con mas fallos', n: hasAnyFail ? mostFailedName : '-', s: hasAnyFail ? String(Math.max(mostFailedCount, 0)) + ' fallo(s)' : '-' },
      { t: 'Peor desviacion', n: hasAnyFail && worstMargin > 0 ? worstMarginName : '-', s: hasAnyFail && worstMargin > 0 ? (worstMargin * 100).toFixed(1) + '% sobre umbral' : '-' },
    ];

    const chart = document.createElement('article');
    chart.className = 'summary-card chart';
    chart.innerHTML =
      '<div class="donut" style="--pass:' + passedPct.toFixed(2) + ';--fail:' + failedPct.toFixed(2) + ';">' +
        '<div class="donut-center">' +
          '<span class="big">' + pct(passedUrls, Math.max(totalUrls, 1)) + '</span>' +
          '<span class="small">PASS</span>' +
        '</div>' +
      '</div>';
    summaryCards.appendChild(chart);

    cards.forEach((c) => {
      const el = document.createElement('article');
      el.className = 'summary-card';
      el.innerHTML = '<p class="t">' + c.t + '</p><p class="n">' + c.n + '</p><p class="s">' + c.s + '</p>';
      summaryCards.appendChild(el);
    });

    Object.entries(metricAgg).forEach(([k, v]) => {
      const tr = document.createElement('tr');
      const worst = v.worstOver > 0 ? (v.worstOver * 100).toFixed(1) + '%' : 'N/A';
      tr.innerHTML =
        '<td>' + k + '</td>' +
        '<td>' + v.fails + '</td>' +
        '<td>' + pct(v.fails, Math.max(v.total, 1)) + '</td>' +
        '<td>' + worst + '</td>';
      summaryMetricRows.appendChild(tr);
    });
  }

  function renderReport() {
    const results = Array.isArray(reportData.results) ? reportData.results : [];
    const urls = unique(results.map((r) => r.url));
    if (state.view !== 'summary' && urls.indexOf(state.view) === -1) {
      state.view = 'summary';
    }

    buildNav(urls);

    const summarySection = document.getElementById('summarySection');
    const detailSection = document.getElementById('detailSection');
    const checksSection = document.getElementById('checksSection');
    const executionsSection = document.getElementById('executionsSection');
    const filtered = state.view === 'summary' ? results : results.filter((r) => r.url === state.view);
    const ref = filtered.length > 0 ? filtered[filtered.length - 1] : null;

    const resultPill = document.getElementById('resultPill');
    if (resultPill) {
      if (!ref) {
        resultPill.className = 'pill fail';
        resultPill.textContent = 'Sin datos';
      } else {
        resultPill.className = 'pill ' + (ref.passed ? 'pass' : 'fail');
        resultPill.textContent = ref.passed ? 'PASS' : 'FAIL';
      }
    }

    setText('mTimestamp', reportData.generatedAt || 'N/A');
    setText('mEnv', reportData.env || 'N/A');
    setText('mCount', String(results.length));
    setText('mTargets', (reportData.targetUrls || []).join(' | ') || 'N/A');
    setText('mFailed', (reportData.failedTargets || []).join(' | ') || 'Ninguna');
    setText('mView', state.view === 'summary' ? 'Resumen global' : state.view);

    const checkRows = document.getElementById('checkRows');
    const kpis = document.getElementById('kpis');
    const resultRows = document.getElementById('resultRows');
    if (!checkRows || !kpis || !resultRows) return;

    if (summarySection) {
      summarySection.style.display = state.view === 'summary' ? 'block' : 'none';
    }
    if (detailSection) {
      detailSection.style.display = state.view === 'summary' ? 'none' : 'block';
    }
    if (checksSection) {
      checksSection.style.display = state.view === 'summary' ? 'none' : 'block';
    }
    if (executionsSection) {
      executionsSection.style.display = state.view === 'summary' ? 'block' : 'block';
    }
    renderSummary(results);

    checkRows.innerHTML = '';
    kpis.innerHTML = '';
    resultRows.innerHTML = '';

    filtered.forEach((item) => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + (item.timestamp || 'N/A') + '</td>' +
        '<td>' + (item.url || 'N/A') + '</td>' +
        '<td>' + (item.launchProfile || 'N/A') + '</td>' +
        '<td class="' + (item.passed ? 'ok' : 'ko') + '">' + (item.passed ? 'PASS' : 'FAIL') + '</td>' +
        metricCell(item, 'ttfb', readMetricValue(item, 'ttfbMs'), 'ttfb') +
        metricCell(item, 'domContentLoaded', readMetricValue(item, 'domContentLoadedMs'), 'domContentLoaded') +
        metricCell(item, 'load', readMetricValue(item, 'loadMs'), 'load') +
        metricCell(item, 'firstPaint', readMetricValue(item, 'firstPaintMs'), 'firstPaint') +
        metricCell(item, 'firstContentfulPaint', readMetricValue(item, 'firstContentfulPaintMs'), 'firstContentfulPaint') +
        metricCell(item, 'lcp', readMetricValue(item, 'lcpMs'), 'lcp') +
        metricCell(item, 'cls', readMetricValue(item, 'cls'), 'cls') +
        metricCell(item, 'requests', readMetricValue(item, 'requestCount'), 'requests') +
        metricCell(item, 'bytes', readMetricValue(item, 'transferSizeBytes'), 'bytes');
      resultRows.appendChild(tr);
    });

    if (!ref) return;

    Object.entries(ref.checks || {}).forEach(([name, check]) => {
      const tr = document.createElement('tr');
      const value = check.value === null ? 'N/A' : String(check.value);
      tr.innerHTML =
        '<td>' + name + '</td>' +
        '<td>' + value + '</td>' +
        '<td>' + check.threshold + '</td>' +
        '<td class="' + (check.ok ? 'ok' : 'ko') + '">' + (check.ok ? 'PASS' : 'FAIL') + '</td>';
      checkRows.appendChild(tr);
      kpis.appendChild(buildKpiCard(name, check, ref));
    });
  }

  renderReport();
</script>
</body>
</html>`;

  fs.writeFileSync(htmlPath, html, "utf-8");
}

const HISTORY_MAX_RUNS = 200;

function readHistory(reportsDir: string): HistoryStore {
  const jsonPath = path.join(reportsDir, "performance-history.json");
  try {
    const raw = fs.readFileSync(jsonPath, "utf-8");
    const parsed = JSON.parse(raw) as HistoryStore;
    if (!Array.isArray(parsed.runs)) return { runs: [] };
    return parsed;
  } catch {
    return { runs: [] };
  }
}

function appendHistory(reportsDir: string, run: HistoryRun): HistoryStore {
  const store = readHistory(reportsDir);
  store.runs.push(run);
  if (store.runs.length > HISTORY_MAX_RUNS) {
    store.runs = store.runs.slice(store.runs.length - HISTORY_MAX_RUNS);
  }
  const jsonPath = path.join(reportsDir, "performance-history.json");
  fs.writeFileSync(jsonPath, JSON.stringify(store, null, 2), "utf-8");
  return store;
}

function writeHistoryHtml(reportsDir: string, store: HistoryStore, logoDataUrl: string): void {
  const htmlPath = path.join(reportsDir, "performance-history.html");
  const safeJson = JSON.stringify(store).replace(/</g, "\\u003c");
  const allRows = flattenHistoryRuns(store);
  const urlOptionsHtml = buildHistoryOptions(allRows.map((row) => row.url), "Todas");
  const envOptionsHtml = buildHistoryOptions(allRows.map((row) => row.env || row._env), "Todos");
  const profileOptionsHtml = buildHistoryOptions(allRows.map((row) => row.launchProfile), "Todos");
  const initialSummaryHtml = buildHistorySummaryHtml(allRows);
  const initialRowsHtml = buildHistoryTableRowsHtml(allRows);
  const runCountLabel = `${store.runs.length} run(s) almacenados`;
  const logoHtml = logoDataUrl
    ? `<img src="${logoDataUrl}" alt="Izertis" style="height:44px;object-fit:contain;" />`
    : "";

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Histórico de Performance - Playwright</title>
<style>
  :root{
    --surface:#ffffff;
    --text:#0f172a;
    --muted:#475569;
    --border:#dbe3ef;
    --accent:#0a4b88;
    --nav:#f7faff;
    --ok-bg:#e9f9ef;
    --ok:#166534;
    --ko-bg:#fff1f2;
    --ko:#b91c1c;
    --chart-ttfb:#6366f1;
    --chart-dcl:#0ea5e9;
    --chart-load:#f59e0b;
    --chart-lcp:#10b981;
    --chart-cls:#ef4444;
    --chart-req:#8b5cf6;
    --chart-bytes:#f97316;
  }
  *{box-sizing:border-box}
  body{margin:0;background:linear-gradient(160deg,#eef3fb 0%,#f8fbff 45%,#f3f6fb 100%);color:var(--text);font-family:Segoe UI,Arial,sans-serif}
  .wrap{max-width:1560px;margin:20px auto;padding:0 12px 32px}
  .report{background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:0 18px 42px rgba(15,23,42,.08);overflow:visible}
  .head{display:flex;justify-content:space-between;align-items:flex-start;padding:22px 24px;border-bottom:1px solid var(--border);background:linear-gradient(180deg,#ffffff 0%,#f8fbff 100%)}
  .title{margin:0;font-size:22px;font-weight:800;color:#0b2239}
  .subtitle{margin:6px 0 0;color:var(--muted);font-size:14px}
  .head-right{display:flex;flex-direction:column;align-items:flex-end;gap:10px}
  .filters{display:flex;flex-wrap:wrap;gap:10px;padding:16px 24px;border-bottom:1px solid var(--border);background:#f8fbff;align-items:flex-end}
  .filters label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.4px}
  .filters select,.filters input[type=text]{border:1px solid var(--border);border-radius:8px;padding:7px 10px;font-size:13px;color:#0f172a;background:#fff;min-width:160px}
  .filters select:focus,.filters input:focus{outline:2px solid var(--accent);outline-offset:1px}
  .btn{padding:7px 14px;border-radius:8px;border:1px solid var(--border);background:#fff;font-size:13px;font-weight:700;color:#0a4b88;cursor:pointer}
  .btn:hover{background:#eef6ff}
  .btn.primary{background:var(--accent);color:#fff;border-color:var(--accent)}
  .btn.primary:hover{background:#073861}
  .content{padding:20px 24px 28px}
  .section{margin-bottom:28px}
  .section-title{font-size:16px;font-weight:800;color:#0b2239;margin:0 0 14px}
  .kpi-selector{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
  .section-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:14px}
  .section-toolbar .section-title{margin:0}
  .kpi-btn{padding:5px 12px;border-radius:999px;border:1px solid var(--border);background:#fff;font-size:12px;font-weight:700;cursor:pointer;transition:background .1s,color .1s}
  .kpi-btn.active{background:var(--accent);color:#fff;border-color:var(--accent)}
  .chart-wrap{position:relative;width:100%;height:320px;background:#fff;border:1px solid var(--border);border-radius:12px;overflow:hidden}
  canvas{display:block;width:100%!important;height:100%!important}
  .summary-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:20px}
  .summary-card{border:1px solid var(--border);border-radius:10px;background:#fff;padding:12px 14px}
  .summary-card .t{font-size:12px;color:var(--muted);margin:0 0 6px}
  .summary-card .n{font-size:22px;font-weight:800;color:#0b2239;margin:0}
  .summary-card .s{font-size:12px;color:#64748b;margin:4px 0 0}
  .table-scroll{overflow-x:auto;width:100%}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{border:1px solid var(--border);padding:8px 10px;text-align:left;white-space:nowrap}
  th{background:#f7faff;font-weight:700;color:#1e293b}
  tr:hover td{background:#f8fbff}
  .ok{color:var(--ok);font-weight:700}
  .ko{color:var(--ko);font-weight:700}
  .pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700}
  .pill.pass{background:var(--ok-bg);color:var(--ok)}
  .pill.fail{background:var(--ko-bg);color:var(--ko)}
  .no-data{text-align:center;padding:48px 24px;color:var(--muted);font-size:15px}
  @media (max-width:768px){
    .filters{flex-direction:column}
    .filters select,.filters input[type=text]{min-width:100%}
    .chart-wrap{height:240px}
    .head{flex-direction:column;gap:12px}
  }
</style>
</head>
<body>
<div class="wrap">
  <article class="report">
    <header class="head">
      <div>
        <h1 class="title">Histórico de Performance</h1>
        <p class="subtitle">Evolución temporal de métricas de carga · Playwright</p>
      </div>
      <div class="head-right">
        <span id="runCountBadge" style="font-size:13px;color:#64748b;font-weight:700">${runCountLabel}</span>
        <div>${logoHtml}</div>
      </div>
    </header>

    <div class="filters">
      <label>URL
        <select id="fUrl">${urlOptionsHtml}</select>
      </label>
      <label>Entorno
        <select id="fEnv">${envOptionsHtml}</select>
      </label>
      <label>Perfil
        <select id="fProfile">${profileOptionsHtml}</select>
      </label>
      <label>Resultado
        <select id="fResult">
          <option value="">Todos</option>
          <option value="pass">Solo PASS</option>
          <option value="fail">Solo FAIL</option>
        </select>
      </label>
      <label>Últimas N ejecuciones (por URL)
        <input type="text" id="fLast" value="20" style="max-width:90px" />
      </label>
      <div style="display:flex;gap:8px;align-items:flex-end">
        <button class="btn primary" onclick="applyFilters()">Aplicar</button>
        <button class="btn" onclick="resetFilters()">Limpiar</button>
      </div>
    </div>

    <div class="content">
      <div class="section">
        <div class="summary-row" id="summaryRow">${initialSummaryHtml}</div>
      </div>

      <div class="section">
        <div class="section-toolbar">
          <p class="section-title">Evolución temporal</p>
          <div class="kpi-selector" id="chartModeSelector"></div>
        </div>
        <div class="kpi-selector" id="kpiSelector"></div>
        <div class="chart-wrap" id="trendChartWrap" style="height:auto;min-height:320px;overflow:visible;padding:12px"></div>
      </div>

      <div class="section">
        <p class="section-title">Tasa de fallos por KPI</p>
        <div class="chart-wrap" id="failRateChartWrap" style="height:240px"></div>
      </div>

      <div class="section">
        <p class="section-title">Detalle de ejecuciones</p>
        <div class="table-scroll">
          <table id="histTable">
            <thead>
              <tr>
                <th>Fecha</th><th>URL</th><th>Entorno</th><th>Perfil</th><th>Resultado</th>
                <th>TTFB</th><th>DCL</th><th>Load</th><th>FP</th><th>FCP</th><th>LCP</th><th>CLS</th><th>Requests</th><th>Bytes</th>
              </tr>
            </thead>
            <tbody id="histRows">${initialRowsHtml}</tbody>
          </table>
        </div>
      </div>
    </div>
  </article>
</div>

<script>
const historyData = ${safeJson};

const KPI_META = [
  { key: 'ttfbMs',             label: 'TTFB',     description: 'Time to First Byte',        explanation: 'Tiempo desde que el navegador solicita la página hasta recibir el primer byte del servidor. Mide latencia de red y respuesta del servidor.', unit: 'ms',    color: '#6366f1', checkKey: 'ttfb'             },
  { key: 'domContentLoadedMs', label: 'DCL',      description: 'DOM Content Loaded',        explanation: 'Tiempo hasta que el navegador termina de descargar y procesar el HTML. No incluye CSS, imágenes o scripts externos.', unit: 'ms',    color: '#0ea5e9', checkKey: 'domContentLoaded' },
  { key: 'loadMs',             label: 'Load',     description: 'Page Load Time',            explanation: 'Tiempo total hasta que la página se carga completamente, incluyendo todos los recursos (CSS, imágenes, scripts).', unit: 'ms',    color: '#f59e0b', checkKey: 'load'             },
  { key: 'firstPaintMs',       label: 'FP',       description: 'First Paint',               explanation: 'Tiempo hasta que el navegador pinta por primera vez cualquier pixel en pantalla.', unit: 'ms',    color: '#14b8a6', checkKey: 'firstPaint'       },
  { key: 'firstContentfulPaintMs', label: 'FCP',  description: 'First Contentful Paint',    explanation: 'Tiempo hasta que se renderiza el primer contenido (texto, imagen o canvas).', unit: 'ms',    color: '#22c55e', checkKey: 'firstContentfulPaint' },
  { key: 'lcpMs',              label: 'LCP',      description: 'Largest Contentful Paint', explanation: 'Tiempo hasta que el elemento más grande se renderiza en pantalla. Métrica Core Web Vitals que indica cuándo es visible el contenido principal.', unit: 'ms',    color: '#10b981', checkKey: 'lcp'              },
  { key: 'cls',                label: 'CLS',      description: 'Cumulative Layout Shift',   explanation: 'Medida de inestabilidad visual. Suma cambios de posición inesperados de elementos. Un valor bajo indica una experiencia estable.', unit: '',      color: '#ef4444', checkKey: 'cls'              },
  { key: 'requestCount',       label: 'Requests', description: 'Total Requests Count',      explanation: 'Número total de peticiones HTTP para cargar la página. Menos peticiones mejora el rendimiento.', unit: '',      color: '#8b5cf6', checkKey: 'requests'         },
  { key: 'transferSizeBytes',  label: 'Bytes',    description: 'Total Transfer Size',       explanation: 'Tamaño total en bytes de todos los recursos descargados (HTML, CSS, imágenes, scripts, etc.).', unit: 'bytes', color: '#f97316', checkKey: 'bytes'            },
];

let activeKpis = {
  ttfbMs: true,
  domContentLoadedMs: true,
  loadMs: true,
  firstPaintMs: true,
  firstContentfulPaintMs: true,
  lcpMs: true,
  cls: true,
  requestCount: true,
  transferSizeBytes: true,
};

let chartMode = 'median';

// â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function flattenRuns(store) {
  const rows = [];
  (store.runs || []).forEach(run => {
    (run.results || []).forEach(r => {
      rows.push(Object.assign({}, r, { _runId: run.runId, _env: run.env }));
    });
  });
  return rows;
}

function unique(arr) {
  const seen = {};
  const values = [];
  arr.forEach(value => {
    if (!value || seen[value]) return;
    seen[value] = true;
    values.push(value);
  });
  return values;
}

function fmtMs(v) { return v == null || isNaN(v) ? 'N/A' : Math.round(v) + ' ms'; }
function fmtNum(v) { return v == null || isNaN(v) ? 'N/A' : Math.round(v).toLocaleString(); }
function fmtCls(v) { return v == null || isNaN(v) ? 'N/A' : Number(v).toFixed(3); }
function metricMedian(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'object' && Number.isFinite(Number(raw.median))) return Number(raw.median);
  return null;
}
function metricValue(report, key) {
  if (!report || !report.metrics) return null;
  return metricMedian(report.metrics[key]);
}
function metricSeries(report, key) {
  if (!report || !report.metrics) return { runs: [], median: null, p95: null };
  const raw = report.metrics[key];
  if (raw === null || raw === undefined) return { runs: [], median: null, p95: null };
  if (typeof raw === 'number' && Number.isFinite(raw)) return { runs: [raw], median: raw, p95: raw };
  return {
    runs: Array.isArray(raw.runs) ? raw.runs.map(v => Number(v)).filter(v => Number.isFinite(v)).sort((a, b) => a - b) : [],
    median: Number.isFinite(Number(raw.median)) ? Number(raw.median) : null,
    p95: Number.isFinite(Number(raw.p95)) ? Number(raw.p95) : null,
  };
}
function metricSeriesValue(report, key, mode) {
  const series = metricSeries(report, key);
  if (mode === 'p95') return series.p95;
  return series.median;
}
function metricRunsText(report, key) {
  const series = metricSeries(report, key);
  if (!series.runs.length) return 'Runs: N/A';
  return 'Runs: ' + series.runs.map(v => fmtKpi(key, v)).join(' · ');
}
function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function fmtKpi(key, v) {
  if (v == null || (typeof v === 'number' && isNaN(v))) return 'N/A';
  if (key === 'cls') return fmtCls(v);
  if (key === 'transferSizeBytes' || key === 'requestCount') return fmtNum(v);
  return fmtMs(v);
}

function shortDate(ts) {
  if (!ts) return 'N/A';
  const d = new Date(ts);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' ' +
         d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function urlPath(url) {
  const i = url ? url.indexOf('//') : -1;
  if (i < 0) return url || '';
  const rest = url.slice(i + 2);
  const j = rest.indexOf('/');
  return j < 0 ? '/' : rest.slice(j) || '/';
}

// â”€â”€ populate filters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function populateFilters() {
  const all = flattenRuns(historyData);
  const urls = unique(all.map(r => r.url));
  const envs = unique(all.map(r => r.env || r._env));
  const profiles = unique(all.map(r => r.launchProfile));

  const fUrl = document.getElementById('fUrl');
  fUrl.innerHTML = '<option value="">Todas</option>';
  urls.forEach(u => { const o = document.createElement('option'); o.value = o.textContent = u; fUrl.appendChild(o); });

  const fEnv = document.getElementById('fEnv');
  fEnv.innerHTML = '<option value="">Todos</option>';
  envs.forEach(e => { const o = document.createElement('option'); o.value = o.textContent = e; fEnv.appendChild(o); });

  const fProfile = document.getElementById('fProfile');
  fProfile.innerHTML = '<option value="">Todos</option>';
  profiles.forEach(p => { const o = document.createElement('option'); o.value = o.textContent = p; fProfile.appendChild(o); });
}

// â”€â”€ filtering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getFiltered() {
  const fUrl = document.getElementById('fUrl').value;
  const fEnv = document.getElementById('fEnv').value;
  const fProfile = document.getElementById('fProfile').value;
  const fResult = document.getElementById('fResult').value;
  const fLast = parseInt(document.getElementById('fLast').value, 10) || 0;

  let rows = flattenRuns(historyData);
  if (fUrl) rows = rows.filter(r => r.url === fUrl);
  if (fEnv) rows = rows.filter(r => (r.env || r._env) === fEnv);
  if (fProfile) rows = rows.filter(r => r.launchProfile === fProfile);
  if (fResult === 'pass') rows = rows.filter(r => r.passed);
  if (fResult === 'fail') rows = rows.filter(r => !r.passed);

  if (fLast > 0) {
    const byUrl = {};
    rows.forEach(r => { (byUrl[r.url] = byUrl[r.url] || []).push(r); });
    rows = Object.keys(byUrl).reduce((acc, key) => acc.concat(byUrl[key].slice(-fLast)), []);
    rows.sort((a, b) => String(a.timestamp) < String(b.timestamp) ? -1 : 1);
  }
  return rows;
}

// â”€â”€ summary cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function renderSummary(rows) {
  const el = document.getElementById('summaryRow');
  if (!rows.length) { el.innerHTML = ''; return; }

  const total = rows.length;
  const passed = rows.filter(r => r.passed).length;
  const failed = total - passed;
  const passRate = total ? ((passed / total) * 100).toFixed(1) : '0.0';
  const urls = unique(rows.map(r => r.url)).length;
  const runs = unique(rows.map(r => r._runId)).length;

  const avgOf = key => {
    const vals = rows.map(r => Number(metricValue(r, key))).filter(v => Number.isFinite(v));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const avgTtfb = avgOf('ttfbMs');
  const avgLoad = avgOf('loadMs');
  const avgLcp  = avgOf('lcpMs');

  const cards = [
    { t: 'Ejecuciones totales', n: String(total),     s: runs + ' run(s)' },
    { t: 'URLs distintas',      n: String(urls),       s: 'en el filtro actual' },
    { t: 'PASS',                n: String(passed),     s: passRate + '%' },
    { t: 'FAIL',                n: String(failed),     s: ((100 - Number(passRate)).toFixed(1)) + '%' },
    { t: 'TTFB medio',          n: avgTtfb != null ? Math.round(avgTtfb) + ' ms' : 'N/A', s: 'promedio filtrado' },
    { t: 'Load medio',          n: avgLoad != null ? Math.round(avgLoad) + ' ms' : 'N/A', s: 'promedio filtrado' },
    { t: 'LCP medio',           n: avgLcp  != null ? Math.round(avgLcp)  + ' ms' : 'N/A', s: 'promedio filtrado' },
  ];

  el.innerHTML = cards.map(c =>
    '<article class="summary-card"><p class="t">' + c.t + '</p><p class="n">' + c.n + '</p><p class="s">' + c.s + '</p></article>'
  ).join('');
}

// â”€â”€ KPI selector â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function renderKpiSelector() {
  const el = document.getElementById('kpiSelector');
  el.innerHTML = KPI_META.map(k =>
    '<button class="kpi-btn' + (activeKpis[k.key] ? ' active' : '') + '" data-key="' + k.key + '" onclick="toggleKpi(this)">' + k.label + '</button>'
  ).join('');
}

function renderChartModeSelector() {
  const el = document.getElementById('chartModeSelector');
  if (!el) return;
  const modes = [
    { key: 'median', label: 'Median' },
    { key: 'p95', label: 'P95' },
    { key: 'both', label: 'Ambas' },
  ];
  el.innerHTML = modes.map(mode =>
    '<button class="kpi-btn' + (chartMode === mode.key ? ' active' : '') + '" data-mode="' + mode.key + '" onclick="toggleChartMode(this)">' + mode.label + '</button>'
  ).join('');
}

function toggleChartMode(btn) {
  chartMode = btn.dataset.mode || 'median';
  applyFilters();
}

function toggleKpi(btn) {
  const key = btn.dataset.key;
  const activeCount = KPI_META.filter(k => activeKpis[k.key]).length;
  if (activeKpis[key]) {
    if (activeCount > 1) { activeKpis[key] = false; btn.classList.remove('active'); }
  } else {
    activeKpis[key] = true; btn.classList.add('active');
  }
  applyFilters();
}

// â”€â”€ SVG Charts (fully self-contained, no external dependencies) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function formatAxisValue(key, value) {
  if (!Number.isFinite(value)) return 'N/A';
  if (key === 'cls') return Number(value).toFixed(3);
  if (key === 'transferSizeBytes') return Math.round(value / 1024) + ' KB';
  if (key === 'requestCount') return String(Math.round(value));
  return Math.round(value) + ' ms';
}

function getThresholdForKpi(key, rows) {
  for (let i = 0; i < rows.length; i++) {
    const t = rows[i] && rows[i].thresholds ? rows[i].thresholds : null;
    if (!t) continue;
    if (key === 'ttfbMs' && Number.isFinite(Number(t.ttfbMsMax))) return Number(t.ttfbMsMax);
    if (key === 'domContentLoadedMs' && Number.isFinite(Number(t.dclMsMax))) return Number(t.dclMsMax);
    if (key === 'loadMs' && Number.isFinite(Number(t.loadMsMax))) return Number(t.loadMsMax);
    if (key === 'firstPaintMs' && Number.isFinite(Number(t.firstPaintMsMax))) return Number(t.firstPaintMsMax);
    if (key === 'firstContentfulPaintMs' && Number.isFinite(Number(t.firstContentfulPaintMsMax))) {
      return Number(t.firstContentfulPaintMsMax);
    }
    if (key === 'lcpMs' && Number.isFinite(Number(t.lcpMsMax))) return Number(t.lcpMsMax);
    if (key === 'cls' && Number.isFinite(Number(t.clsMax))) return Number(t.clsMax);
    if (key === 'requestCount' && Number.isFinite(Number(t.requestsMax))) return Number(t.requestsMax);
    if (key === 'transferSizeBytes' && Number.isFinite(Number(t.bytesMax))) return Number(t.bytesMax);
  }
  return null;
}

function renderSVGLineChart(rows) {
  const wrap = document.getElementById('trendChartWrap');
  if (!wrap) return;

  const activeMeta = KPI_META.filter(k => activeKpis[k.key]);
  if (!rows.length || !activeMeta.length) {
    wrap.innerHTML = '<p style="padding:32px;text-align:center;color:#94a3b8;font-size:14px">Sin datos para los filtros seleccionados.</p>';
    return;
  }

  const sorted = rows.slice().sort((a, b) => String(a.timestamp) < String(b.timestamp) ? -1 : 1);
  const byUrl = {};
  sorted.forEach(r => { if (!byUrl[r.url]) byUrl[r.url] = []; byUrl[r.url].push(r); });
  const urlKeys = Object.keys(byUrl);
  const URL_COLORS = ['#2563eb', '#dc2626', '#059669', '#7c3aed', '#ea580c', '#0e7490', '#be185d', '#334155', '#65a30d', '#4338ca'];
  const urlColorMap = {};
  urlKeys.forEach((u, i) => { urlColorMap[u] = URL_COLORS[i % URL_COLORS.length]; });
  const xLabels = sorted.map(r => shortDate(r.timestamp));
  const n = sorted.length;

  const chartHtml = activeMeta.map(kpi => {
    const W = Math.max(840, (wrap.clientWidth || 900) - 24);
    const H = 230;
    const ML = 60, MR = 16, MT = 32, MB = 44;
    const CW = W - ML - MR;
    const CH = H - MT - MB;

    const threshold = getThresholdForKpi(kpi.key, sorted);
    const allVals = [];
    sorted.forEach(r => {
      const medianVal = Number(metricSeriesValue(r, kpi.key, 'median'));
      const p95Val = Number(metricSeriesValue(r, kpi.key, 'p95'));
      if (chartMode !== 'p95' && Number.isFinite(medianVal)) allVals.push(medianVal);
      if (chartMode !== 'median' && Number.isFinite(p95Val)) allVals.push(p95Val);
    });
    if (Number.isFinite(threshold)) allVals.push(Number(threshold));
    if (!allVals.length) {
      return '<div style="border:1px solid #dbe3ef;border-radius:10px;padding:10px;background:#fff">' +
        '<div style="font-size:13px;font-weight:800;color:#0b2239;margin:0 0 8px">' + kpi.label + '</div>' +
        '<p style="margin:0;padding:18px;color:#94a3b8">Sin datos</p></div>';
    }

    let minV = Math.min.apply(null, allVals);
    let maxV = Math.max.apply(null, allVals);
    let span = maxV - minV;
    if (span < 1e-9) span = Math.max(1, Math.abs(maxV) * 0.1);
    const pad = span * 0.12;
    minV -= pad;
    maxV += pad;
    span = maxV - minV;

    const xAt = i => ML + (n > 1 ? (i / (n - 1)) * CW : CW / 2);
    const yAt = v => MT + CH - ((v - minV) / span) * CH;

    let gridSVG = '';
    let yAxisLabels = '';
    for (let g = 0; g <= 4; g++) {
      const y = MT + (g / 4) * CH;
      const val = maxV - (g / 4) * span;
      gridSVG += '<line x1="' + ML + '" y1="' + y.toFixed(1) + '" x2="' + (ML + CW) + '" y2="' + y.toFixed(1) + '" stroke="#e2e8f0" stroke-width="1"/>';
      yAxisLabels += '<text x="' + (ML - 8) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end" font-size="10" fill="#64748b">' + formatAxisValue(kpi.key, val) + '</text>';
    }

    let zonesSvg = '';
    let thresholdSvg = '';
    if (Number.isFinite(threshold)) {
      const ty = yAt(Number(threshold));
      if (ty >= MT && ty <= MT + CH) {
        zonesSvg += '<rect x="' + ML + '" y="' + MT.toFixed(1) + '" width="' + CW.toFixed(1) + '" height="' + Math.max(0, ty - MT).toFixed(1) + '" fill="rgba(239,68,68,0.08)"/>';
        zonesSvg += '<rect x="' + ML + '" y="' + ty.toFixed(1) + '" width="' + CW.toFixed(1) + '" height="' + Math.max(0, MT + CH - ty).toFixed(1) + '" fill="rgba(16,185,129,0.10)"/>';
        zonesSvg += '<text x="' + (ML + CW - 6) + '" y="' + (MT + 12).toFixed(1) + '" text-anchor="end" font-size="10" fill="#b91c1c">Zona FAIL</text>';
        zonesSvg += '<text x="' + (ML + CW - 6) + '" y="' + (MT + CH - 6).toFixed(1) + '" text-anchor="end" font-size="10" fill="#0f766e">Zona PASS</text>';
        thresholdSvg += '<line x1="' + ML + '" y1="' + ty.toFixed(1) + '" x2="' + (ML + CW) + '" y2="' + ty.toFixed(1) + '" stroke="#b91c1c" stroke-width="1.5" stroke-dasharray="5,4"/>';
        thresholdSvg += '<text x="' + (ML + 6) + '" y="' + (ty - 6).toFixed(1) + '" font-size="10" font-weight="700" fill="#b91c1c">Umbral PASS <= ' + formatAxisValue(kpi.key, Number(threshold)) + '</text>';
      }
    }

    let linesSvg = '';
    let dotsSvg = '';
    let legendHtml = '';
    urlKeys.forEach((url, ui) => {
      const seriesColor = urlColorMap[url] || kpi.color;
      const medianVals = sorted.map(r => (r.url === url ? Number(metricSeriesValue(r, kpi.key, 'median')) : null));
      const p95Vals = sorted.map(r => (r.url === url ? Number(metricSeriesValue(r, kpi.key, 'p95')) : null));

      const drawSeries = (vals, label, dash, opacity) => {
        let path = '';
        vals.forEach((v, i) => {
          if (!Number.isFinite(v)) return;
          const px = xAt(i);
          const py = yAt(v);
          path += (path ? ' L' : 'M') + px.toFixed(1) + ',' + py.toFixed(1);
          const tooltip = [
            kpi.label + ' · ' + label,
            'URL: ' + url,
            'Fecha: ' + xLabels[i],
            'Valor: ' + formatAxisValue(kpi.key, v),
            metricRunsText(sorted[i], kpi.key),
          ].join('\\n');
          dotsSvg += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="3" fill="' + seriesColor + '" fill-opacity="' + opacity + '">' +
            '<title>' + tooltip + '</title></circle>';
        });
        if (!path) return;
        linesSvg += '<path d="' + path + '" stroke="' + seriesColor + '" stroke-opacity="' + opacity + '" stroke-width="2" fill="none"' + (dash ? ' stroke-dasharray="6,4"' : '') + '/>';
      };

      if (chartMode !== 'p95') drawSeries(medianVals, 'Median', false, '1');
      if (chartMode !== 'median') drawSeries(p95Vals, 'P95', true, chartMode === 'both' ? '0.72' : '1');

      if ((chartMode === 'median' && !medianVals.some(v => Number.isFinite(v))) || (chartMode === 'p95' && !p95Vals.some(v => Number.isFinite(v))) || (chartMode === 'both' && !medianVals.some(v => Number.isFinite(v)) && !p95Vals.some(v => Number.isFinite(v)))) return;
      legendHtml += '<div style="display:flex;align-items:flex-start;gap:8px;padding:2px 0;color:#334155;font-size:11px">' +
        '<span style="display:inline-block;width:16px;height:3px;background:' + seriesColor + ';margin-top:6px;border-radius:2px"></span>' +
        '<span><strong style="color:#0f172a">URL ' + (ui + 1) + ':</strong> ' + url + '</span></div>';
    });

    const maxLabels = Math.max(2, Math.floor(CW / 95));
    const step = n <= maxLabels ? 1 : Math.ceil(n / maxLabels);
    let xLabelsSvg = '';
    for (let i = 0; i < n; i += step) {
      const x = xAt(i);
      xLabelsSvg += '<text x="' + x.toFixed(1) + '" y="' + (MT + CH + 16) + '" text-anchor="middle" font-size="10" fill="#64748b">' + xLabels[i] + '</text>';
    }

    const modeLegend = chartMode === 'both'
      ? '<div style="font-size:11px;color:#64748b;margin:0 0 6px">Median: línea continua · P95: línea discontinua</div>'
      : '<div style="font-size:11px;color:#64748b;margin:0 0 6px">Serie visible: ' + (chartMode === 'p95' ? 'P95' : 'Median') + '</div>';

    return '<div style="border:1px solid #dbe3ef;border-radius:10px;padding:10px;background:#fff;margin-bottom:12px">' +
      '<div style="margin-bottom:6px">' +
        '<div style="font-size:13px;font-weight:800;color:#0b2239">' + kpi.label + '</div>' +
        '<div style="font-size:11px;font-weight:400;color:#64748b">' + kpi.description + '</div>' +
        '<div style="font-size:10px;font-weight:400;color:#94a3b8;margin-top:4px">' + kpi.explanation + '</div>' +
      '</div>' +
      modeLegend +
      '<div style="margin:0 0 8px;padding:6px 8px;border:1px dashed #dbe3ef;border-radius:8px;background:#f8fbff">' +
      '<div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:3px">Leyenda de líneas por URL</div>' + legendHtml + '</div>' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" style="display:block;width:100%;height:' + H + 'px">' +
      '<rect width="' + W + '" height="' + H + '" fill="#fff"/>' + zonesSvg + gridSVG + yAxisLabels + thresholdSvg + linesSvg + dotsSvg + xLabelsSvg +
      '</svg></div>';
  }).join('');

  wrap.innerHTML = '<div style="display:block">' + chartHtml + '</div>';
}

function renderSVGBarChart(rows) {
  const wrap = document.getElementById('failRateChartWrap');
  if (!wrap) return;
  const W = wrap.clientWidth || 900;
  const H = wrap.clientHeight || 240;
  const ML = 44, MR = 12, MT = 16, MB = 40;
  const CW = W - ML - MR;
  const CH = H - MT - MB;

  const counts = {};
  KPI_META.forEach(k => { counts[k.checkKey] = { fail: 0, total: 0 }; });
  rows.forEach(r => {
    const cks = r.checks || {};
    Object.keys(cks).forEach(ck => {
      const ch = cks[ck];
      if (!counts[ck]) counts[ck] = { fail: 0, total: 0 };
      counts[ck].total++;
      if (!ch.ok) counts[ck].fail++;
    });
  });

  const nk = KPI_META.length;
  const barW = Math.floor(CW / nk * 0.55);
  const barGap = CW / nk;

  let gridSVG = '', yLabelsSVG = '';
  for (let g = 0; g <= 4; g++) {
    const gv = g * 25;
    const gy = MT + CH - (gv / 100) * CH;
    gridSVG += '<line x1="' + ML + '" y1="' + gy.toFixed(1) + '" x2="' + (ML + CW) + '" y2="' + gy.toFixed(1) +
      '" stroke="' + (g === 4 ? '#cbd5e1' : '#e2e8f0') + '" stroke-width="1"/>';
    yLabelsSVG += '<text x="' + (ML - 5) + '" y="' + (gy + 4).toFixed(1) + '" font-size="10" fill="#94a3b8" text-anchor="end">' + gv + '%</text>';
  }

  let barsSVG = '';
  KPI_META.forEach((kpi, i) => {
    const c = counts[kpi.checkKey];
    const rate = c && c.total ? (c.fail / c.total) * 100 : 0;
    const bx = ML + barGap * i + (barGap - barW) / 2;
    const bh = (rate / 100) * CH;
    const by = MT + CH - bh;
    barsSVG += '<rect x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + barW +
      '" height="' + Math.max(bh, 2).toFixed(1) + '" fill="' + kpi.color + 'bb" stroke="' + kpi.color + '" stroke-width="1" rx="4">' +
      '<title>' + kpi.label + ': ' + rate.toFixed(1) + '%</title></rect>';
    if (rate > 0) {
      barsSVG += '<text x="' + (bx + barW / 2).toFixed(1) + '" y="' + (by - 4).toFixed(1) +
        '" font-size="10" fill="' + kpi.color + '" text-anchor="middle" font-weight="700">' + rate.toFixed(0) + '%</text>';
    }
    barsSVG += '<text x="' + (bx + barW / 2).toFixed(1) + '" y="' + (MT + CH + 16) +
      '" font-size="12" fill="#334155" text-anchor="middle" font-weight="700">' + kpi.label + '</text>';
  });

  wrap.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ' + W + ' ' + H + '" style="display:block;width:100%;height:100%">' +
    '<rect width="' + W + '" height="' + H + '" fill="#fff"/>' + gridSVG + yLabelsSVG + barsSVG + '</svg>';
}

// â”€â”€ table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function renderTable(rows) {
  const tbody = document.getElementById('histRows');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="14" class="no-data">No hay datos para los filtros seleccionados.</td></tr>';
    return;
  }
  const sorted = rows.slice().sort((a, b) => String(b.timestamp) < String(a.timestamp) ? -1 : 1);
  tbody.innerHTML = sorted.map(r => {
    const m = {
      ttfbMs: metricValue(r, 'ttfbMs'),
      domContentLoadedMs: metricValue(r, 'domContentLoadedMs'),
      loadMs: metricValue(r, 'loadMs'),
      firstPaintMs: metricValue(r, 'firstPaintMs'),
      firstContentfulPaintMs: metricValue(r, 'firstContentfulPaintMs'),
      lcpMs: metricValue(r, 'lcpMs'),
      cls: metricValue(r, 'cls'),
      requestCount: metricValue(r, 'requestCount'),
      transferSizeBytes: metricValue(r, 'transferSizeBytes'),
    };
    const ck = r.checks || {};
    const cell = (checkKey, val, fmt) => {
      const failed = ck[checkKey] && !ck[checkKey].ok;
      const key = KPI_META.find(meta => meta.checkKey === checkKey).key;
      const title = escapeAttr(metricRunsText(r, key) + '\\nMedian: ' + fmtKpi(key, metricSeriesValue(r, key, 'median')) + '\\nP95: ' + fmtKpi(key, metricSeriesValue(r, key, 'p95')));
      return '<td' + (failed ? ' class="ko"' : '') + ' title="' + title + '">' + fmt(val) + '</td>';
    };
    return '<tr>' +
      '<td>' + shortDate(r.timestamp) + '</td>' +
      '<td>' + (r.url || 'N/A') + '</td>' +
      '<td>' + (r.env || 'N/A') + '</td>' +
      '<td>' + (r.launchProfile || 'N/A') + '</td>' +
      '<td><span class="pill ' + (r.passed ? 'pass' : 'fail') + '">' + (r.passed ? 'PASS' : 'FAIL') + '</span></td>' +
      cell('ttfb',             m.ttfbMs,             fmtMs) +
      cell('domContentLoaded', m.domContentLoadedMs,  fmtMs) +
      cell('load',             m.loadMs,              fmtMs) +
      cell('firstPaint',       m.firstPaintMs,        fmtMs) +
      cell('firstContentfulPaint', m.firstContentfulPaintMs, fmtMs) +
      cell('lcp',              m.lcpMs,               fmtMs) +
      cell('cls',              m.cls,                 fmtCls) +
      cell('requests',         m.requestCount,        fmtNum) +
      cell('bytes',            m.transferSizeBytes,   fmtNum) +
    '</tr>';
  }).join('');
}

// â”€â”€ main â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function applyFilters() {
  const rows = getFiltered();
  renderSummary(rows);
  renderKpiSelector();
  renderChartModeSelector();
  renderSVGLineChart(rows);
  renderSVGBarChart(rows);
  renderTable(rows);
}

function resetFilters() {
  document.getElementById('fUrl').value = '';
  document.getElementById('fEnv').value = '';
  document.getElementById('fProfile').value = '';
  document.getElementById('fResult').value = '';
  document.getElementById('fLast').value = '20';
  applyFilters();
}

(function init() {
  document.getElementById('runCountBadge').textContent = (historyData.runs || []).length + ' run(s) almacenados';
  populateFilters();
  renderKpiSelector();
  renderChartModeSelector();
  applyFilters();
})();
</script>
</body>
</html>`;

  fs.writeFileSync(htmlPath, html, "utf-8");
}

function isRetriableNavigationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const retriableCodes = [
    "ERR_HTTP2_PROTOCOL_ERROR",
    "ERR_CONNECTION_RESET",
    "ERR_CONNECTION_CLOSED",
    "ERR_CONNECTION_TIMED_OUT",
    "ERR_TIMED_OUT",
    "ERR_NETWORK_CHANGED",
    "Timeout",
    "TimeoutError",
  ];
  return retriableCodes.some((code) => message.includes(code));
}

function getWaitUntilFromEnv(): WaitUntilState {
  const value = (process.env.PERF_WAIT_UNTIL || "domcontentloaded").toLowerCase();
  if (value === "load" || value === "domcontentloaded" || value === "networkidle" || value === "commit") {
    return value;
  }
  return "domcontentloaded";
}

function loadEnv(projectRoot: string): string {
  const env = process.env.ENV || "local";
  const envFilePath = path.join(projectRoot, `.env.${env}`);
  if (fs.existsSync(envFilePath)) {
    dotenv.config({ path: envFilePath });
  }
  return env;
}

function getTargetUrls(): string[] {
  const defaultUrls = [
    "https://www.elcorteingles.es/",
    "https://www.elcorteingles.es/joyeria-y-relojes/",
  ];

  const rawUrls = process.env.PERF_TARGET_URLS?.trim();
  if (rawUrls) {
    return Array.from(
      new Set(
        rawUrls
          .split(",")
          .map((url) => url.trim())
          .filter(Boolean),
      ),
    );
  }

  const singleUrl = process.env.PERF_TARGET_URL?.trim();
  if (singleUrl) {
    return [singleUrl];
  }

  return defaultUrls;
}

function getProfiles(debugMatrix: boolean): LaunchProfile[] {
  const disableHttp2 = readBooleanEnv("PERF_DISABLE_HTTP2", false);
  const disableWebSecurity = readBooleanEnv("PERF_DISABLE_WEB_SECURITY", false);
  const disableAutomationControlled = readBooleanEnv("PERF_DISABLE_AUTOMATION_CONTROLLED", true);

  const baseArgs: string[] = [];
  if (disableAutomationControlled) {
    baseArgs.push("--disable-blink-features=AutomationControlled");
  }
  if (disableWebSecurity) {
    baseArgs.push("--disable-web-security", "--disable-features=IsolateOrigins,site-per-process");
  }

  const http2Args = disableHttp2 ? ["--disable-http2", "--disable-features=Http2ServerPush"] : [];

  const defaultProfile: LaunchProfile = {
    name: disableHttp2 ? "chromium-http2-off" : "chromium-default",
    args: [...baseArgs, ...http2Args],
  };

  if (!debugMatrix) {
    return [defaultProfile];
  }

  return [
    { name: "chromium-default", args: [...baseArgs] },
    { name: "chromium-http2-off", args: [...baseArgs, "--disable-http2", "--disable-features=Http2ServerPush"] },
    { name: "chrome-default", channel: "chrome", args: [...baseArgs] },
    { name: "chrome-http2-off", channel: "chrome", args: [...baseArgs, "--disable-http2", "--disable-features=Http2ServerPush"] },
  ];
}

function aggregateMetrics(reports: PerfRunSampleReport[]): PerfMetrics {
  const samples = reports.map((report) => report.metrics);
  return {
    ttfbMs: toMetricSeries(samples.map((metric) => metric.ttfbMs)),
    domContentLoadedMs: toMetricSeries(samples.map((metric) => metric.domContentLoadedMs)),
    loadMs: toMetricSeries(samples.map((metric) => metric.loadMs)),
    requestCount: toMetricSeries(samples.map((metric) => metric.requestCount)),
    transferSizeBytes: toMetricSeries(samples.map((metric) => metric.transferSizeBytes)),
    lcpMs: toMetricSeries(samples.map((metric) => metric.lcpMs)),
    cls: toMetricSeries(samples.map((metric) => metric.cls)),
    firstPaintMs: toMetricSeries(samples.map((metric) => metric.firstPaintMs)),
    firstContentfulPaintMs: toMetricSeries(samples.map((metric) => metric.firstContentfulPaintMs)),
  };
}

function aggregateRunReports(reports: PerfRunSampleReport[], thresholds: Thresholds): PerfReport {
  const first = reports[0];
  const metrics = aggregateMetrics(reports);
  const checks = buildChecks(metrics, thresholds);
  const passed = Object.values(checks).every((check) => check.ok);
  const statuses = reports
    .map((report) => report.httpStatus)
    .filter((status): status is number => typeof status === "number" && Number.isFinite(status));

  return {
    timestamp: new Date().toISOString(),
    env: first.env,
    url: first.url,
    launchProfile: first.launchProfile,
    runtime: first.runtime,
    httpStatus: statuses.length === 0 ? first.httpStatus : statuses[statuses.length - 1],
    thresholds,
    metrics,
    checks,
    passed,
  };
}

function buildChecks(metrics: PerfMetrics, thresholds: Thresholds): PerfReport["checks"] {
  const ttfbMedian = metrics.ttfbMs.median;
  const dclMedian = metrics.domContentLoadedMs.median;
  const loadMedian = metrics.loadMs.median;
  const firstPaintMedian = metrics.firstPaintMs.median;
  const firstContentfulPaintMedian = metrics.firstContentfulPaintMs.median;
  const requestsMedian = metrics.requestCount.median;
  const bytesMedian = metrics.transferSizeBytes.median;
  const lcpMedian = metrics.lcpMs.median;
  const clsMedian = metrics.cls.median;

  return {
    ttfb: {
      value: ttfbMedian,
      threshold: `<= ${thresholds.ttfbMsMax} ms`,
      ok: Number.isFinite(ttfbMedian) && Number(ttfbMedian) <= thresholds.ttfbMsMax,
    },
    domContentLoaded: {
      value: dclMedian,
      threshold: `<= ${thresholds.dclMsMax} ms`,
      ok: Number.isFinite(dclMedian) && Number(dclMedian) <= thresholds.dclMsMax,
    },
    load: {
      value: loadMedian,
      threshold: `<= ${thresholds.loadMsMax} ms`,
      ok: Number.isFinite(loadMedian) && Number(loadMedian) <= thresholds.loadMsMax,
    },
    firstPaint: {
      value: firstPaintMedian,
      threshold: `<= ${thresholds.firstPaintMsMax} ms`,
      ok: Number.isFinite(firstPaintMedian) && Number(firstPaintMedian) <= thresholds.firstPaintMsMax,
    },
    firstContentfulPaint: {
      value: firstContentfulPaintMedian,
      threshold: `<= ${thresholds.firstContentfulPaintMsMax} ms`,
      ok:
        Number.isFinite(firstContentfulPaintMedian) &&
        Number(firstContentfulPaintMedian) <= thresholds.firstContentfulPaintMsMax,
    },
    requests: {
      value: requestsMedian,
      threshold: `<= ${thresholds.requestsMax}`,
      ok: Number.isFinite(requestsMedian) && Number(requestsMedian) <= thresholds.requestsMax,
    },
    bytes: {
      value: bytesMedian,
      threshold: `<= ${thresholds.bytesMax} bytes`,
      ok: Number.isFinite(bytesMedian) && Number(bytesMedian) <= thresholds.bytesMax,
    },
    lcp: {
      value: lcpMedian,
      threshold: `<= ${thresholds.lcpMsMax} ms`,
      ok: lcpMedian === null || Number(lcpMedian) <= thresholds.lcpMsMax,
    },
    cls: {
      value: clsMedian,
      threshold: `<= ${thresholds.clsMax}`,
      ok: clsMedian === null || Number(clsMedian) <= thresholds.clsMax,
    },
  };
}


async function collectMetrics(page: any): Promise<PerfMetricsSample> {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const paints = performance.getEntriesByType("paint") as PerformanceEntry[];
    const firstPaint = paints.find((entry) => entry.name === "first-paint")?.startTime ?? null;
    const fcp = paints.find((entry) => entry.name === "first-contentful-paint")?.startTime ?? null;
    const navTransferSize = nav ? Number(nav.transferSize || 0) : 0;
    const transferSizeBytes = navTransferSize + resources.reduce((total, resource) => total + Number(resource.transferSize || 0), 0);
    const custom = (window as any).__pwPerfMetrics || {};

    return {
      ttfbMs: nav ? nav.responseStart : NaN,
      domContentLoadedMs: nav ? nav.domContentLoadedEventEnd : NaN,
      loadMs: nav ? nav.loadEventEnd : NaN,
      requestCount: resources.length,
      transferSizeBytes,
      lcpMs: Number.isFinite(custom.lcp) ? custom.lcp : null,
      cls: Number.isFinite(custom.cls) ? custom.cls : null,
      firstPaintMs: firstPaint,
      firstContentfulPaintMs: fcp,
    };
  });
}

async function collectRuntime(page: any, headless: boolean): Promise<RuntimeInfo> {
  const runtime = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    webdriver: typeof navigator.webdriver === "boolean" ? navigator.webdriver : null,
    languages: Array.isArray(navigator.languages) ? navigator.languages : [],
  }));

  return {
    headless,
    userAgent: runtime.userAgent,
    webdriver: runtime.webdriver,
    languages: runtime.languages,
  };
}

// ---------------------------------------------------------------------------
// Auth state helpers
// ---------------------------------------------------------------------------

/**
 * Generates a Playwright storageState file by performing a generic form login.
 *
 * Required ENV vars (only needed when the state file does not yet exist):
 *   PERF_LOGIN_URL    — Full URL of the login page
 *   PERF_LOGIN_USER   — Username / email credential
 *   PERF_LOGIN_PASS   — Password credential
 *
 * Optional ENV vars (all have sensible defaults):
 *   PERF_LOGIN_SELECTOR_USER    — CSS selector for the username field
 *                                 (default: common email/username inputs)
 *   PERF_LOGIN_SELECTOR_PASS    — CSS selector for the password field
 *                                 (default: input[type="password"])
 *   PERF_LOGIN_SELECTOR_SUBMIT  — CSS selector for the submit button
 *                                 (default: common submit button selectors)
 *   PERF_LOGIN_WAIT_URL         — Substring that the post-login URL must contain
 *                                 before considering login complete (optional)
 *   PERF_LOGIN_WAIT_SELECTOR    — CSS selector of an element that only appears
 *                                 once logged in (optional, e.g. ".user-avatar")
 *   PERF_LOGIN_WAIT_AFTER       — Extra ms to wait after submit (default: 3000)
 */
async function createAuthStateIfNeeded(statePath: string): Promise<void> {
  const loginUrl = process.env.PERF_LOGIN_URL;
  const loginUser = process.env.PERF_LOGIN_USER;
  const loginPass = process.env.PERF_LOGIN_PASS;

  if (!loginUrl || !loginUser || !loginPass) {
    throw new Error(
      `PERF_AUTH_STATE_PATH is set to "${statePath}" but the file does not exist. ` +
        "Provide PERF_LOGIN_URL, PERF_LOGIN_USER, and PERF_LOGIN_PASS so the auth state can be created automatically.",
    );
  }

  const selectorUser =
    process.env.PERF_LOGIN_SELECTOR_USER ||
    'input[type="email"], input[name="email"], input[name="username"], ' +
      'input[id*="user" i], input[id*="email" i], input[placeholder*="email" i], ' +
      'input[placeholder*="usuario" i], input[autocomplete="username"], input[autocomplete="email"]';

  const selectorPass =
    process.env.PERF_LOGIN_SELECTOR_PASS || 'input[type="password"]';

  const selectorSubmit =
    process.env.PERF_LOGIN_SELECTOR_SUBMIT ||
    'button[type="submit"], input[type="submit"], [data-testid*="login" i], ' +
      '[data-testid*="submit" i], button:has-text("Iniciar"), button:has-text("Login"), ' +
      'button:has-text("Sign in"), button:has-text("Acceder")';

  const waitAfterMs = readNumberEnv("PERF_LOGIN_WAIT_AFTER", 3000);
  const waitUrl = process.env.PERF_LOGIN_WAIT_URL;
  const waitSelector = process.env.PERF_LOGIN_WAIT_SELECTOR;

  console.log(`[auth] No auth state found at "${statePath}". Performing login at: ${loginUrl}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  try {
    await page.goto(loginUrl, { waitUntil: "networkidle", timeout: 30_000 });

    await page.locator(selectorUser).first().fill(loginUser);
    await page.locator(selectorPass).first().fill(loginPass);
    await page.locator(selectorSubmit).first().click();

    // Wait for explicit success signal if configured
    if (waitUrl) {
      await page.waitForURL((u) => u.toString().includes(waitUrl), { timeout: 20_000 });
    } else if (waitSelector) {
      await page.waitForSelector(waitSelector, { timeout: 20_000 });
    } else {
      // Generic: wait for networkidle + extra settling time
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
      await page.waitForTimeout(waitAfterMs);
    }

    // Double-settle regardless of signal type
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

    // Ensure parent directory exists
    const stateDir = path.dirname(statePath);
    if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });

    await context.storageState({ path: statePath });
    console.log(`[auth] Auth state saved → ${statePath}`);
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function runOnce(params: {
  profile: LaunchProfile;
  url: string;
  headless: boolean;
  waitUntil: WaitUntilState;
  navigationTimeout: number;
  readyStateTimeout: number;
  thresholds: Thresholds;
  storageStatePath?: string;
}): Promise<PerfRunSampleReport> {
  const { profile, url, headless, waitUntil, navigationTimeout, readyStateTimeout, thresholds, storageStatePath } = params;

  const browser = await chromium.launch({ headless, channel: profile.channel, args: profile.args });
  const context = await browser.newContext({
    viewport: {
      width: readNumberEnv("PERF_VIEWPORT_WIDTH", 1280),
      height: readNumberEnv("PERF_VIEWPORT_HEIGHT", 720),
    },
    ignoreHTTPSErrors: true,
    locale: "es-ES",
    userAgent:
      process.env.PERF_USER_AGENT ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    extraHTTPHeaders: {
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    },
    ...(storageStatePath ? { storageState: storageStatePath } : {}),
  });

  const page = await context.newPage();

  await page.addInitScript(() => {
    (window as any).__pwPerfMetrics = { lcp: null, cls: 0 };
    try {
      const lcpObserver = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        const last = entries[entries.length - 1];
        if (last) (window as any).__pwPerfMetrics.lcp = last.startTime;
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });

      const clsObserver = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries() as any[]) {
          if (!entry.hadRecentInput) (window as any).__pwPerfMetrics.cls += entry.value;
        }
      });
      clsObserver.observe({ type: "layout-shift", buffered: true });
    } catch {
      // ignore unsupported observers
    }
  });

  try {
    const response = await page.goto(url, { waitUntil, timeout: navigationTimeout });

    await page
      .waitForFunction(() => document.readyState === "interactive" || document.readyState === "complete", {
        timeout: readyStateTimeout,
      })
      .catch(() => undefined);

    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
    await page.waitForTimeout(1000);

    const metrics = await collectMetrics(page);
    const runtime = await collectRuntime(page, headless);

    return {
      timestamp: new Date().toISOString(),
      env: process.env.ENV || "local",
      url: page.url() || url,
      launchProfile: profile.name,
      runtime,
      httpStatus: response?.status() ?? null,
      thresholds,
      metrics,
    };
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const projectRoot = path.resolve(__dirname, "..");
  const env = loadEnv(projectRoot);
  const logoDataUrl = readLogoBase64(projectRoot);

  const targetUrls = getTargetUrls();
  const fallbackUrl = process.env.PERF_FALLBACK_URL || "https://www.elcorteingles.es/supermercado/";

  const thresholds: Thresholds = {
    ttfbMsMax: readNumberEnv("PERF_TTFB_MAX", 1200),
    dclMsMax: readNumberEnv("PERF_DCL_MAX", 3500),
    loadMsMax: readNumberEnv("PERF_LOAD_MAX", 7000),
    firstPaintMsMax: readNumberEnv("PERF_FP_MAX", 2000),
    firstContentfulPaintMsMax: readNumberEnv("PERF_FCP_MAX", 2500),
    requestsMax: readNumberEnv("PERF_REQUESTS_MAX", 250),
    bytesMax: readNumberEnv("PERF_BYTES_MAX", 8_000_000),
    lcpMsMax: readNumberEnv("PERF_LCP_MAX", 4000),
    clsMax: readNumberEnv("PERF_CLS_MAX", 0.1),
  };

  const headless = process.env.HEADLESS !== "false";
  const waitUntil = getWaitUntilFromEnv();
  const navigationTimeout = readNumberEnv("PERF_NAVIGATION_TIMEOUT", 60_000);
  const readyStateTimeout = readNumberEnv("PERF_READY_STATE_TIMEOUT", 25_000);
  const retries = readNumberEnv("PERF_NAV_RETRIES", 0);
  const runs = Math.max(1, Math.floor(readNumberEnv("PERF_RUNS", 3)));
  const debugMatrix = readBooleanEnv("PERF_DEBUG_MATRIX", false);

  const profiles = getProfiles(debugMatrix);

  const reportsDir = path.join(projectRoot, "reports", "performance", "playwright");
  ensureDir(reportsDir);
  cleanPreviousReportArtifacts(reportsDir);

  // ---------------------------------------------------------------------------
  // Auth state — resolve and (if needed) generate
  // ---------------------------------------------------------------------------
  let storageStatePath: string | undefined;
  const rawAuthPath = process.env.PERF_AUTH_STATE_PATH;
  if (rawAuthPath) {
    storageStatePath = path.isAbsolute(rawAuthPath)
      ? rawAuthPath
      : path.resolve(projectRoot, rawAuthPath);
    if (!fs.existsSync(storageStatePath)) {
      await createAuthStateIfNeeded(storageStatePath);
    } else {
      console.log(`[auth] Using existing auth state: ${storageStatePath}`);
    }
  }

  console.log("Starting performance run:");
  console.log(`  HEADLESS: ${headless}`);
  console.log(`  DEBUG_MATRIX: ${debugMatrix}`);
  console.log(`  WAIT_UNTIL: ${waitUntil}`);
  console.log(`  RUNS: ${runs}`);
  console.log(`  AUTH: ${storageStatePath ? storageStatePath : "none (public URL)"}`);
  console.log(`  Target URLs: ${targetUrls.join(" | ")}`);
  console.log(`  Profiles: ${profiles.map((p) => p.name).join(" | ")}`);

  const failedTargets: string[] = [];
  const collectedReports: PerfReport[] = [];

  for (const targetUrl of targetUrls) {
    const candidateUrls =
      targetUrls.length === 1 && fallbackUrl && fallbackUrl !== targetUrl ? [targetUrl, fallbackUrl] : [targetUrl];
    let targetSucceeded = false;

    for (const profile of profiles) {
      if (targetSucceeded) break;

      for (const url of candidateUrls) {
        if (!url || url.trim().length === 0) continue;

        const successfulSamples: PerfRunSampleReport[] = [];

        for (let runIndex = 1; runIndex <= runs; runIndex += 1) {
          let sample: PerfRunSampleReport | null = null;

          for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
            try {
              sample = await runOnce({
                profile,
                url,
                headless,
                waitUntil,
                navigationTimeout,
                readyStateTimeout,
                thresholds,
                storageStatePath,
              });
              break;
            } catch (error) {
              const retriable = isRetriableNavigationError(error);
              if (!retriable || attempt >= retries + 1) {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(
                  `[WARN] Discarding failed sample ${runIndex}/${runs} for ${url} (${profile.name}): ${message}`,
                );
                break;
              }

              await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
            }
          }

          if (sample) {
            successfulSamples.push(sample);
          }
        }

        if (successfulSamples.length === 0) {
          continue;
        }

        const report = aggregateRunReports(successfulSamples, thresholds);
        const latestPath = path.join(reportsDir, "performance-kpis.json");
        collectedReports.push(report);

        const partialPayload: PerfKpisJsonReport = {
          generatedAt: new Date().toISOString(),
          env,
          targetUrls,
          results: collectedReports,
          failedTargets,
        };

        writeKpisJsonReport(reportsDir, partialPayload);
        writeSelfContainedHtmlReport(reportsDir, partialPayload, logoDataUrl);

        console.log("Visual report:", path.relative(projectRoot, path.join(reportsDir, "performance-kpis.html")));
        console.log("Latest report:", path.relative(projectRoot, latestPath));
        console.log("URL:", report.url);
        console.log("Profile:", report.launchProfile);
        console.log("Successful samples:", `${successfulSamples.length}/${runs}`);
        console.log("HTTP Status:", report.httpStatus);
        console.log("Result:", report.passed ? "PASS" : "FAIL");
        console.log("Metrics (median | p95):");
        console.log(
          `  TTFB: ${report.metrics.ttfbMs.median === null ? "N/A" : `${Math.round(report.metrics.ttfbMs.median)} ms`} | ${report.metrics.ttfbMs.p95 === null ? "N/A" : `${Math.round(report.metrics.ttfbMs.p95)} ms`}`,
        );
        console.log(
          `  DCL: ${report.metrics.domContentLoadedMs.median === null ? "N/A" : `${Math.round(report.metrics.domContentLoadedMs.median)} ms`} | ${report.metrics.domContentLoadedMs.p95 === null ? "N/A" : `${Math.round(report.metrics.domContentLoadedMs.p95)} ms`}`,
        );
        console.log(
          `  Load: ${report.metrics.loadMs.median === null ? "N/A" : `${Math.round(report.metrics.loadMs.median)} ms`} | ${report.metrics.loadMs.p95 === null ? "N/A" : `${Math.round(report.metrics.loadMs.p95)} ms`}`,
        );
        console.log(
          `  FP: ${report.metrics.firstPaintMs.median === null ? "N/A" : `${Math.round(report.metrics.firstPaintMs.median)} ms`} | ${report.metrics.firstPaintMs.p95 === null ? "N/A" : `${Math.round(report.metrics.firstPaintMs.p95)} ms`}`,
        );
        console.log(
          `  FCP: ${report.metrics.firstContentfulPaintMs.median === null ? "N/A" : `${Math.round(report.metrics.firstContentfulPaintMs.median)} ms`} | ${report.metrics.firstContentfulPaintMs.p95 === null ? "N/A" : `${Math.round(report.metrics.firstContentfulPaintMs.p95)} ms`}`,
        );
        console.log(
          `  Requests: ${report.metrics.requestCount.median === null ? "N/A" : Math.round(report.metrics.requestCount.median)} | ${report.metrics.requestCount.p95 === null ? "N/A" : Math.round(report.metrics.requestCount.p95)}`,
        );
        console.log(
          `  Transfer size: ${report.metrics.transferSizeBytes.median === null ? "N/A" : `${Math.round(report.metrics.transferSizeBytes.median)} bytes`} | ${report.metrics.transferSizeBytes.p95 === null ? "N/A" : `${Math.round(report.metrics.transferSizeBytes.p95)} bytes`}`,
        );
        console.log(
          `  LCP: ${report.metrics.lcpMs.median === null ? "N/A" : `${Math.round(report.metrics.lcpMs.median)} ms`} | ${report.metrics.lcpMs.p95 === null ? "N/A" : `${Math.round(report.metrics.lcpMs.p95)} ms`}`,
        );
        console.log(
          `  CLS: ${report.metrics.cls.median === null ? "N/A" : report.metrics.cls.median.toFixed(3)} | ${report.metrics.cls.p95 === null ? "N/A" : report.metrics.cls.p95.toFixed(3)}`,
        );

        if (!report.passed) process.exitCode = 1;
        targetSucceeded = true;
        break;
      }
    }

    if (!targetSucceeded) {
      failedTargets.push(targetUrl);
    }
  }

  if (collectedReports.length === 0) {
    const historyStore = readHistory(reportsDir);
    writeHistoryHtml(reportsDir, historyStore, logoDataUrl);
    throw new Error(
      `All ${runs} sample(s) failed for every target URL. No performance-kpis.json was generated. Failed targets: ${failedTargets.join(" | ")}`,
    );
  }

  const finalPayload: PerfKpisJsonReport = {
    generatedAt: new Date().toISOString(),
    env,
    targetUrls,
    results: collectedReports,
    failedTargets,
  };

  writeKpisJsonReport(reportsDir, finalPayload);
  writeSelfContainedHtmlReport(reportsDir, finalPayload, logoDataUrl);

  const historyRun: HistoryRun = {
    runId: finalPayload.generatedAt,
    generatedAt: finalPayload.generatedAt,
    env,
    targetUrls,
    failedTargets,
    results: collectedReports,
  };
  const historyStore = appendHistory(reportsDir, historyRun);
  writeHistoryHtml(reportsDir, historyStore, logoDataUrl);
  console.log("History report:", path.relative(projectRoot, path.join(reportsDir, "performance-history.html")));

  if (failedTargets.length > 0) {
    throw new Error(`Navigation failed for ${failedTargets.length} target URL(s). Failed targets: ${failedTargets.join(" | ")}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Performance API run failed:", message);
  process.exit(1);
});
