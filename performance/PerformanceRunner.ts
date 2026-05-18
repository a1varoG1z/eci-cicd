import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Page } from '@playwright/test';

type PerfCheck = {
  value: number | null;
  threshold: string;
  ok: boolean;
};

type PerfMetricSeries = {
  runs: number[];
  median: number | null;
  p95: number | null;
};

type PerfMetrics = {
  ttfbMs: PerfMetricSeries;
  domContentLoadedMs: PerfMetricSeries;
  loadMs: PerfMetricSeries;
  requestCount: PerfMetricSeries;
  transferSizeBytes: PerfMetricSeries;
  lcpMs: PerfMetricSeries;
  cls: PerfMetricSeries;
  firstPaintMs: PerfMetricSeries;
  firstContentfulPaintMs: PerfMetricSeries;
};

type PerfReport = {
  timestamp: string;
  env: string;
  url: string;
  launchProfile: string;
  httpStatus: number | null;
  metrics: PerfMetrics;
  checks: Record<string, PerfCheck>;
  passed: boolean;
};

type PerfKpisJsonReport = {
  generatedAt: string;
  env: string;
  targetUrls: string[];
  results: PerfReport[];
  failedTargets: string[];
};

export type PerformanceAuditResult = {
  passed: boolean;
  url: string;
  report: PerfReport;
  outputJsonPath: string;
  outputHtmlPath: string;
  historyJsonPath: string;
  historyHtmlPath: string;
};

export class PerformanceRunner {
  private readonly page: Page;
  private readonly projectRoot: string;
  private readonly reportsDir: string;

  constructor(page: Page) {
    this.page = page;
    this.projectRoot = path.resolve(__dirname, '..');
    this.reportsDir = path.join(this.projectRoot, 'reports', 'performance', 'playwright');
  }

  async audit(): Promise<PerformanceAuditResult> {
    const currentUrl = this.page.url();
    if (!currentUrl) {
      throw new Error('La página actual no tiene URL. Ejecuta primero el Given de navegación/login.');
    }

    fs.mkdirSync(this.reportsDir, { recursive: true });

    const tempStatePath = path.join(
      os.tmpdir(),
      `eci-performance-auth-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );

    await this.page.context().storageState({ path: tempStatePath });

    try {
      await this.runStandaloneScript(currentUrl, tempStatePath);
      const payload = this.readLatestReport();
      const result = payload.results.find((item) => item.url === currentUrl) || payload.results[0];

      if (!result) {
        throw new Error('El script de performance finalizó, pero no generó resultados en performance-kpis.json.');
      }

      return {
        passed: result.passed,
        url: currentUrl,
        report: result,
        outputJsonPath: path.join(this.reportsDir, 'performance-kpis.json'),
        outputHtmlPath: path.join(this.reportsDir, 'performance-kpis.html'),
        historyJsonPath: path.join(this.reportsDir, 'performance-history.json'),
        historyHtmlPath: path.join(this.reportsDir, 'performance-history.html'),
      };
    } finally {
      if (fs.existsSync(tempStatePath)) {
        fs.rmSync(tempStatePath, { force: true });
      }
    }
  }

  private async runStandaloneScript(targetUrl: string, storageStatePath: string): Promise<void> {
    const tsxPath = this.resolveTsxPath();
    const scriptPath = path.join(this.projectRoot, 'scripts', 'playwright-performance.ts');
    const env = {
      ...process.env,
      ENV: process.env.ENV || 'local',
      HEADLESS: process.env.HEADLESS || 'true',
      PERF_WAIT_UNTIL: process.env.PERF_WAIT_UNTIL || 'domcontentloaded',
      PERF_NAV_RETRIES: process.env.PERF_NAV_RETRIES || '0',
      PERF_TARGET_URLS: targetUrl,
      PERF_FALLBACK_URL: targetUrl,
      PERF_AUTH_STATE_PATH: storageStatePath,
    };

    const command = process.platform === 'win32' ? process.env.comspec || 'cmd.exe' : tsxPath;
    const args = process.platform === 'win32' ? ['/d', '/s', '/c', tsxPath, scriptPath] : [scriptPath];

    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: this.projectRoot,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });

      let stderr = '';

      child.stdout.on('data', (chunk) => {
        process.stdout.write(chunk);
      });

      child.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        stderr += text;
        process.stderr.write(chunk);
      });

      child.on('error', (error) => {
        reject(error);
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(
          new Error(
            `La ejecución de scripts/playwright-performance.ts terminó con código ${code}. ${stderr.trim()}`,
          ),
        );
      });
    });
  }

  private readLatestReport(): PerfKpisJsonReport {
    const jsonPath = path.join(this.reportsDir, 'performance-kpis.json');
    if (!fs.existsSync(jsonPath)) {
      throw new Error(`No existe el reporte JSON esperado en ${jsonPath}`);
    }

    const raw = fs.readFileSync(jsonPath, 'utf-8');
    return JSON.parse(raw) as PerfKpisJsonReport;
  }

  private resolveTsxPath(): string {
    const localBin = path.join(
      this.projectRoot,
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'tsx.cmd' : 'tsx',
    );

    if (fs.existsSync(localBin)) {
      return localBin;
    }

    throw new Error(`No se encontró el ejecutable de tsx en ${localBin}`);
  }
}