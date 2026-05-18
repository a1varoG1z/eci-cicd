import { Before, After, BeforeAll, AfterAll, Status, setDefaultTimeout } from '@cucumber/cucumber';
import { ICustomWorld } from './world';
import {
  accessibilityTotalPages,
  accessibilityOkPages,
  accessibilityKoPages,
  accessibilityPagesSummary,
} from './accessibility';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import path from 'path';

// Timeout global por step (ej. 60 segundos) para dar margen a la navegación y a axe-core
setDefaultTimeout(60 * 1000);

// ════════════════════════════════════════════════════════════════════════════
// 🎨 COLORES ANSI PARA CONSOLA
// ════════════════════════════════════════════════════════════════════════════
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  
  // Colores de texto
  violet: '\x1b[35m',
  magenta: '\x1b[95m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  
  // Backgrounds
  bgViolet: '\x1b[45m',
  bgBlack: '\x1b[40m',
};

// Variables globales para tracking
let totalScenarios = 0;
let passedScenarios = 0;
let failedScenarios = 0;
let skippedScenarios = 0;
let totalDuration = 0;
let startTime: number;

// Determinar el entorno (por defecto 'local')
const env = process.env.ENV || 'local';

// Cargar el archivo .env correspondiente
const envFilePath = path.resolve(__dirname, `../../.env.${env}`);
dotenv.config({ path: envFilePath });
const environment = process.env.NODE_ENV || process.env.ENV || 'local';

BeforeAll(async function() {
  const dirs = ['reports', 'reports/screenshots', 'reports/security'];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
  
  // Limpiar reportes de accesibilidad de ejecuciones anteriores para evitar acumulación
  const accessibilityDir = 'reports/accessibility';
  if (fs.existsSync(accessibilityDir)) {
    fs.rmSync(accessibilityDir, { recursive: true, force: true });
  }
  
  // Iniciar contador de tiempo
  startTime = Date.now();
  console.log('\n============================================');
  console.log(` 🎬  ${colors.violet}${colors.bright}- Playwright FW${colors.reset}`);
  console.log('============================================\n');
});

Before(async function(this: ICustomWorld, scenario) {
  const browserType = (process.env.BROWSER as 'chromium' | 'firefox' | 'webkit') || 'chromium';
  await this.openBrowser(browserType);
  this.clearTestData();
  totalScenarios++;
  console.log(`\n${colors.cyan}🚀 Iniciando escenario:${colors.reset} ${scenario.pickle.name} ${colors.gray}en navegador: ${browserType}${colors.reset}`);
  console.log(`${colors.violet}⚙️  Entorno:${colors.reset} ${environment}`);
  console.log(`${colors.violet}🌐 URL:${colors.reset} ${process.env.BASE_URL_SUPERMERCADO!}${colors.reset}`);
});

After(async function(this: ICustomWorld, scenario) {
  try {
    if (scenario.result?.status === Status.FAILED) {
      const scenarioName = scenario.pickle.name.replace(/[^a-zA-Z0-9]/g, '-');
      await this.takeScreenshot(`failed-${scenarioName}`);
      failedScenarios++;
    } else if (scenario.result?.status === Status.PASSED) {
      passedScenarios++;
    } else if (scenario.result?.status === Status.SKIPPED) {
      skippedScenarios++;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.log(`${colors.yellow}⚠️  Error al tomar screenshot:${colors.reset} ${errorMessage}`);
  } finally {
    await this.closeBrowser();
    
    // Log individual del escenario
    if (scenario.result?.status === Status.FAILED) {
      console.log(`${colors.red}❌ Escenario fallido:${colors.reset} ${scenario.pickle.name}\n`);
    } else if (scenario.result?.status === Status.PASSED) {
      console.log(`${colors.green}✅ Escenario exitoso:${colors.reset} ${scenario.pickle.name}\n`);
    } else {
      console.log(`${colors.gray}⊘  Escenario saltado:${colors.reset} ${scenario.pickle.name}\n`);
    }
  }
});

AfterAll(async function() {
  const endTime = Date.now();
  totalDuration = (endTime - startTime) / 1000; // en segundos
  
  const passRate = totalScenarios > 0 ? ((passedScenarios / totalScenarios) * 100).toFixed(2) : '0';
  
  console.log(`${colors.bright}${colors.cyan}-------------------------------------------------`);
  console.log(`📊 RESUMEN DE EJECUCIÓN`);
  console.log(`-------------------------------------------------${colors.reset}`);
  console.log('');
  
  // Estadísticas principales
  console.log(`${colors.blue}📈 ESTADÍSTICAS:${colors.reset}`);
  console.log(`  ├─ 📝 Total de escenarios:    ${colors.bright}${totalScenarios}${colors.reset}`);
  console.log(`  ├─ ${colors.green}✅ Escenarios exitosos:${colors.reset}    ${colors.green}${colors.bright}${passedScenarios}${colors.reset}`);
  console.log(`  ├─ ${colors.red}❌ Escenarios fallidos:${colors.reset}    ${colors.red}${colors.bright}${failedScenarios}${colors.reset}`);
  console.log(`  ├─ ${colors.gray}⊘  Escenarios saltados:${colors.reset}    ${colors.gray}${skippedScenarios}${colors.reset}`);
  console.log(`  └─ ${colors.cyan}🎯 Tasa de éxito:${colors.reset}          ${colors.bright}${passRate}%${colors.reset}`);
  console.log('');

  // Accesibilidad (estadísticas generales) – justo después de las estadísticas de tests
  if (accessibilityTotalPages > 0) {
    const accessibilityPassRate =
      (accessibilityOkPages / accessibilityTotalPages) * 100;
    console.log(`${colors.blue}🔍 ACCESIBILIDAD:${colors.reset}`);
    console.log(
      `  ├─ 🌐 Páginas chequeadas:      ${colors.bright}${accessibilityTotalPages}${colors.reset}`
    );
    console.log(
      `  ├─ ✅ Páginas sin incidencias: ${colors.green}${colors.bright}${accessibilityOkPages}${colors.reset}`
    );
    console.log(
      `  ├─ ❌ Páginas con incidencias: ${colors.red}${colors.bright}${accessibilityKoPages}${colors.reset}`
    );
    console.log(
      `  └─ 🎯 Tasa de éxito:          ${colors.bright}${accessibilityPassRate.toFixed(
        2
      )}%${colors.reset}`
    );
    console.log('');

    // Detalle por página/contexto según criticidad
    console.log(`${colors.blue}🔎 DETALLE DE ACCESIBILIDAD POR PÁGINA:${colors.reset}`);
    accessibilityPagesSummary.forEach(page => {
      const { context, totalViolations, byImpact } = page;
      console.log(`  • ${colors.white}${context}${colors.reset}`);
      console.log(
        `    ├─ Total errors:    ${colors.bright}${totalViolations}${colors.reset}`
      );
      console.log(
        `    ├─ ${colors.red}critical:${colors.reset} ${byImpact.critical}  ` +
        `${colors.yellow}serious:${colors.reset} ${byImpact.serious}`
      );
      console.log(
        `    ├─ ${colors.magenta}moderate:${colors.reset} ${byImpact.moderate}  ` +
        `${colors.cyan}minor:${colors.reset} ${byImpact.minor}`
      );
      console.log(
        `    └─ ${colors.gray}unknown:${colors.reset} ${byImpact.unknown}`
      );
    });
    console.log('');

    // Generar índice HTML de accesibilidad con enlaces a los informes y capturas
    try {
      const projectRoot = path.resolve(__dirname, '..', '..');
      const accessibilityDirFull = path.join(projectRoot, 'reports', 'accessibility', 'index.html');

      const rows = accessibilityPagesSummary
        .map(page => {
          const { context, totalViolations, byImpact, htmlRelativePath, screenshotRelativePath } = page;
          const escapedContext = context
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          return `
          <tr onclick="showReport('${htmlRelativePath}')">
            <td>${escapedContext}</td>
            <td>${totalViolations}</td>
            <td>
              <span class="sev-critical">${byImpact.critical} critical</span>,
              <span class="sev-serious">${byImpact.serious} serious</span>,
              <span class="sev-moderate">${byImpact.moderate} moderate</span>,
              <span class="sev-minor">${byImpact.minor} minor</span>,
              <span class="sev-unknown">${byImpact.unknown} unknown</span>
            </td>
            <td><a href="${htmlRelativePath}" target="_blank">Informe</a> | <a href="${screenshotRelativePath}" target="_blank">Captura</a></td>
          </tr>`;
        })
        .join('\n');

      const indexHtml = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Resumen de accesibilidad – Supermercado ECI</title>
  <style>
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      margin: 1.5rem;
      background: #ffffff;
      color: #111111;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }
    .header-title {
      margin: 0;
    }
    .header-logo {
      height: 40px;
      width: auto;
      object-fit: contain;
    }
    h1 { margin-bottom: 0.5rem; }
    p { color: #333333; }
    table { border-collapse: collapse; width: 100%; margin-top: 1rem; font-size: 14px; }
    th, td { padding: .5rem .75rem; border-bottom: 1px solid #dddddd; vertical-align: top; }
    th {
      text-align: left;
      background: #f5f5f5;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    tr:hover { background: #f0f0f0; cursor: pointer; }
    a { color: #1565c0; text-decoration: none; }
    a:hover { text-decoration: underline; }

    .layout {
      display: block;
      margin-top: 1rem;
    }
    .layout__list {
      border: 1px solid #e0e0e0;
      max-height: none;
      overflow: visible;
    }
    .layout__preview {
      margin-top: 1rem;
      height: 80vh; /* marco grande para el informe incrustado */
      border: 1px solid #e0e0e0;
      background: #ffffff;
    }
    iframe {
      width: 100%;
      height: 100%;
      border: 0;
      background: #ffffff;
    }
    .sev-critical { color: #f44336; font-weight: 600; }
    .sev-serious  { color: #ff9800; font-weight: 600; }
    .sev-moderate { color: #f9a825; }
    .sev-minor    { color: #0288d1; }
    .sev-unknown  { color: #9e9e9e; }
  </style>
</head>
<body>
  <div class="header">
    <h1 class="header-title">Resumen de accesibilidad – Supermercado ECI</h1>
    <img src="../../docs/logo-izertis.png" alt="Izertis" class="header-logo" />
  </div>
  <p>Se han analizado <strong>${accessibilityTotalPages}</strong> páginas. Haz clic en una fila para abrir su informe en el panel inferior.</p>

  <div class="layout">
    <div class="layout__list">
      <table>
        <thead>
          <tr>
            <th>Página / Contexto</th>
            <th>Errores</th>
            <th>Severidad</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
${rows}
        </tbody>
      </table>
    </div>

    <div class="layout__preview">
      <iframe id="reportFrame" title="Detalle de accesibilidad"></iframe>
    </div>
  </div>

  <script>
    function showReport(path) {
      const frame = document.getElementById('reportFrame');
      frame.src = path;
    }
  </script>
</body>
</html>`;

      fs.writeFileSync(accessibilityDirFull, indexHtml, 'utf-8');
      console.log(`${colors.cyan}📊 Resumen de accesibilidad generado en:${colors.reset} ${accessibilityDirFull}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`${colors.yellow}⚠️  No se pudo generar el índice de accesibilidad:${colors.reset} ${msg}`);
    }
  }
  
  // Tiempo de ejecución
  console.log(`${colors.magenta}⏱️  TIEMPO DE EJECUCIÓN:${colors.reset}`);
  console.log(`  └─ ${colors.yellow}⏰ Duración total:${colors.reset}         ${colors.bright}${totalDuration.toFixed(2)}s${colors.reset}`);
  console.log('');
  
  // Entorno
  const browser = process.env.BROWSER || 'chromium';
  const headless = process.env.HEADLESS === 'true' ? 'Sí' : 'No';
  const currentEnv = process.env.ENV || 'local';
  
  console.log(`${colors.blue}🔧 CONFIGURACIÓN:${colors.reset}`);
  console.log(`  ├─ 🌐 Navegador:              ${colors.bright}${browser}${colors.reset}`);
  console.log(`  ├─ 👁️  Headless:               ${colors.bright}${headless}${colors.reset}`);
  console.log(`  └─ 🏷️  Entorno:                ${colors.bright}${currentEnv}${colors.reset}`);
  console.log('');
  
  // Reportes
  console.log(`${colors.cyan}📁 REPORTES GENERADOS:${colors.reset}`);
  console.log(`  ├─ 📄 HTML:                   ${colors.gray}reports/cucumber-report.html${colors.reset}`);
  console.log(`  ├─ 📋 JSON:                   ${colors.gray}reports/cucumber-report.json${colors.reset}`);
  if (failedScenarios > 0) {
    console.log(`  ├─ 📸 Screenshots:            ${colors.gray}reports/screenshots/${colors.reset}`);
  }
  // Reportes de accesibilidad (si existen)
  const accessibilityDir = 'reports/accessibility';
  if (fs.existsSync(accessibilityDir)) {
    console.log(`  └─ 🔍 Accesibilidad:           ${colors.gray}${accessibilityDir}/${colors.reset}`);
  }
  console.log('');
  
  // Estado final
  if (failedScenarios === 0) {
    console.log(`${colors.green}${colors.bright}-------------------------------------------------`);
    console.log(`🎉 ¡TODOS LOS TESTS PASARON! 🎉`);
    console.log(`${colors.green}${colors.bright}-------------------------------------------------${colors.reset}`);
  } else {
    console.log(`${colors.red}${colors.bright}-------------------------------------------------`);
    console.log(`⚠️  ALGUNOS TESTS FALLARON ⚠️`);
    console.log(`${colors.red}${colors.bright}-------------------------------------------------${colors.reset}`);
  }
  
  console.log(`\n${colors.white}🏁 Ejecución finalizada${colors.reset}\n`);
});