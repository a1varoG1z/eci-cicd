import AxeBuilder from '@axe-core/playwright';
import { Page } from '@playwright/test';
import { createHtmlReport } from 'axe-html-reporter';
import * as fs from 'fs';
import path from 'path';

// Contadores globales para estadísticas de accesibilidad en el resumen final
export let accessibilityTotalPages = 0;
export let accessibilityOkPages = 0;
export let accessibilityKoPages = 0;

export type AccessibilityImpact = 'critical' | 'serious' | 'moderate' | 'minor' | 'unknown';

export interface AccessibilityPageSummary {
  context: string;
  safeContext: string;
  timestamp: string;
  totalViolations: number;
  byImpact: Record<AccessibilityImpact, number>;
  htmlRelativePath: string;
  screenshotRelativePath: string;
}

// Resumen detallado por página/contexto analizado
export const accessibilityPagesSummary: AccessibilityPageSummary[] = [];

/**
 * Ejecuta un análisis de accesibilidad sobre la página actual y genera un reporte.
 *
 * @param page  Página de Playwright ya situada en el estado que queremos analizar.
 * @param label (opcional) Sufijo descriptivo para diferenciar contextos con la misma URL
 *              (por ejemplo, "modal-entrega-club-del-gourmet").
 */
export async function logAccessibilityViolations(page: Page, label?: string): Promise<void> {
  const accessibilityScanResults = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();;


  // Carpeta base de reportes de accesibilidad, siempre relativa a la raíz del proyecto.
  // Partimos de __dirname = <repo>/tests/support y subimos dos niveles hasta la raíz.
  const projectRoot = path.resolve(__dirname, '..', '..');
  const baseDir = path.join(projectRoot, 'reports', 'accessibility');
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  // Generamos un nombre de fichero legible a partir de la URL (o título) + etiqueta opcional y la fecha
  const baseContext = (await page.url()) || (await page.title()) || 'pagina';
  const rawContext = label ? `${baseContext} - ${label}` : baseContext;
  const safeContext = rawContext
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // Carpeta específica para esta página/contexto dentro de accessibility
  const pageDir = path.join(baseDir, safeContext);
  if (!fs.existsSync(pageDir)) {
    fs.mkdirSync(pageDir, { recursive: true });
  }

  const jsonPath = path.join(pageDir, `${timestamp}.json`);
  const htmlPath = path.join(pageDir, `${timestamp}.html`);

  const violations = accessibilityScanResults.violations || [];

  // Actualizamos contadores globales de accesibilidad
  accessibilityTotalPages += 1;
  if (violations.length === 0) {
    accessibilityOkPages += 1;
  } else {
    accessibilityKoPages += 1;
  }

  // Agregamos resumen por página/contexto desglosado por criticidad
  const impactCounts: Record<AccessibilityImpact, number> = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
    unknown: 0,
  };

  for (const v of violations) {
    const impact = (v.impact as AccessibilityImpact) || 'unknown';
    if (impactCounts[impact] === undefined) {
      impactCounts.unknown += 1;
    } else {
      impactCounts[impact] += 1;
    }
  }

  accessibilityPagesSummary.push({
    context: rawContext,
    safeContext,
    timestamp,
    totalViolations: violations.length,
    byImpact: impactCounts,
    // rutas relativas al índice de accesibilidad (reports/accessibility/index.html)
    htmlRelativePath: path.join(safeContext, `${timestamp}.html`).replace(/\\/g, '/'),
    screenshotRelativePath: path.join(safeContext, `${timestamp}.png`).replace(/\\/g, '/'),
  });

  // Guardamos un JSON con la información relevante
  const simplified = violations.map(v => ({
    id: v.id,
    impact: v.impact,
    description: v.description,
    help: v.help,
    helpUrl: v.helpUrl,
    nodes: v.nodes.map(n => ({
      target: n.target,
      html: n.html,
      failureSummary: n.failureSummary,
    })),
  }));

  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        context: rawContext,
        timestamp,
        errorCount: violations.length,
        errors: simplified,
      },
      null,
      2
    ),
    'utf-8'
  );

  // Generamos el HTML usando axe-html-reporter
  // Importante: dejamos que axe-html-reporter SOLO genere el string HTML,
  // y nosotros mismos escribimos el fichero en `reports/accessibility` para
  // evitar rutas anidadas tipo `Users/.../reports/accessibility`.
  const reportHtml = createHtmlReport({
    results: accessibilityScanResults,
    options: {
      projectKey: rawContext, // usamos URL/título como contexto
      // Indicamos explícitamente que NO cree fichero por su cuenta
      // para evitar carpetas por defecto como "artifacts".
      doNotCreateReportFile: true,
    },
  });

  fs.writeFileSync(htmlPath, reportHtml, 'utf-8');

  // Captura de pantalla completa asociada a este reporte
  const screenshotPath = path.join(pageDir, `${timestamp}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
}

