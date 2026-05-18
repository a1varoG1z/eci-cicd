# Framework de Testing con Playwright, Cucumber y TypeScript

Este repositorio agrupa varios tipos de automatizacion sobre web:

- tests funcionales BDD con Cucumber + Playwright
- auditorias de accesibilidad
- auditorias de seguridad
- auditorias de rendimiento con dos enfoques distintos

El objetivo del proyecto es poder validar comportamiento funcional y, ademas, generar artefactos tecnicos reutilizables para accesibilidad, seguridad y performance.

## Vision general

La base del proyecto se apoya en estos bloques:

- Cucumber + Gherkin para definir escenarios legibles
- Playwright para controlar el navegador y acceder al contexto real de la pagina
- Page Object Model para encapsular navegacion e interacciones
- helpers especializados para seguridad y performance
- reportes HTML y JSON para consumo manual y automatizado

Actualmente conviven dos enfoques para performance:

1. un script standalone orientado a ejecuciones directas y a historico de KPIs
2. un flujo Gherkin que reutiliza el contexto autenticado del test, pero sigue delegando la medicion al mismo script standalone para conservar el comportamiento y los reportes

## Requisitos

Antes de trabajar con el proyecto necesitas:

- Node.js
- Git
- dependencias de Playwright instaladas en local

En este entorno Windows, para ejecutar npm con la version correcta de Node, primero hay que inicializar fnm y seleccionar Node 22:

```powershell
fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression
fnm use 22
```

## Instalacion

1. Clona el repositorio.
2. Entra en la carpeta del proyecto.
3. Ejecuta la instalacion inicial:

```bash
npm run init
```

Ese comando instala dependencias y descarga los navegadores necesarios de Playwright.

## Configuracion de entorno

El proyecto carga configuracion desde `.env.local` o `.env.ci` segun el valor de `ENV`.

Valores habituales:

- `ENV=local`
- `ENV=ci`
- `HEADLESS=true|false`
- `BROWSER=chromium|firefox|webkit`

En `.env.local` ya existe configuracion de ejemplo para performance sobre `www.izertis.com`.

## Ejecucion de tests funcionales y BDD

Scripts principales:

```bash
npm run test:local
npm run test:local:slow
npm run test:headless
npm run test:chromium
npm run test:firefox
npm run test:webkit
npm run test:debug
```

Ejecuciones por tag:

```bash
npm run test:accessibility
npm run test:security
npm run test:performance
```

Notas:

- `test:performance` ejecuta el flujo Gherkin nuevo de auditoria de rendimiento
- `test:security` ejecuta el escaneo de seguridad definido en Cucumber
- el reporte general de Cucumber se genera en cada corrida

## Reportes generados

Reportes generales:

- `reports/cucumber-report.html`
- `reports/cucumber-report.json`
- `reports/screenshots/`

Reportes de accesibilidad:

- `reports/accessibility/`

Reportes de seguridad:

- `reports/security/securityScan.json`
- `reports/security/securityDashboard.html`

Reportes de performance:

- `reports/performance/playwright/performance-kpis.json`
- `reports/performance/playwright/performance-kpis.html`
- `reports/performance/playwright/performance-history.json`
- `reports/performance/playwright/performance-history.html`

## Performance

### Enfoque 1: script standalone

El script principal de performance es `scripts/playwright-performance.ts`.

Su responsabilidad es:

- abrir Chromium con la configuracion indicada
- ejecutar varias tomas por URL
- recoger metricas del navegador mediante Performance API
- calcular agregados por `median` y `p95`
- evaluar checks PASS/FAIL contra umbrales
- generar reportes JSON y HTML
- mantener un historico acumulado de ejecuciones

### KPIs que analiza

Actualmente se miden estos KPIs:

- `TTFB`
- `DOM Content Loaded`
- `Load`
- `First Paint`
- `First Contentful Paint`
- `LCP`
- `CLS`
- numero de requests
- bytes transferidos

Los checks se validan sobre la mediana de las tomas, no sobre una toma individual.

### Como funciona internamente

Por cada URL objetivo y por cada perfil:

1. crea un navegador nuevo
2. crea un contexto nuevo
3. abre una pagina nueva
4. navega a la URL
5. espera a que la pagina quede suficientemente estable
6. recoge las metricas
7. repite el proceso tantas veces como indique `PERF_RUNS`
8. agrega resultados y genera reportes

Esto significa que el script mide sobre contextos frescos por iteracion, que es lo deseable para aproximarse a una navegacion real y no sesgar los KPIs por cache del contexto anterior.

### Scripts disponibles

```bash
npm run performance:playwright
npm run performance:playwright:headless
npm run performance:playwright:ci
npm run performance:playwright:debug
npm run performance:history
```

### Variables de entorno de performance

Configuracion de objetivos:

- `PERF_TARGET_URL`
- `PERF_TARGET_URLS`
- `PERF_FALLBACK_URL`
- `PERF_RUNS`

Umbrales:

- `PERF_TTFB_MAX`
- `PERF_DCL_MAX`
- `PERF_LOAD_MAX`
- `PERF_FP_MAX`
- `PERF_FCP_MAX`
- `PERF_LCP_MAX`
- `PERF_CLS_MAX`
- `PERF_REQUESTS_MAX`
- `PERF_BYTES_MAX`

Ejecucion:

- `PERF_WAIT_UNTIL`
- `PERF_NAVIGATION_TIMEOUT`
- `PERF_READY_STATE_TIMEOUT`
- `PERF_NAV_RETRIES`
- `PERF_DEBUG_MATRIX`
- `PERF_USER_AGENT`
- `PERF_VIEWPORT_WIDTH`
- `PERF_VIEWPORT_HEIGHT`

Autenticacion opcional del script standalone:

- `PERF_AUTH_STATE_PATH`
- `PERF_LOGIN_URL`
- `PERF_LOGIN_USER`
- `PERF_LOGIN_PASS`
- `PERF_LOGIN_SELECTOR_USER`
- `PERF_LOGIN_SELECTOR_PASS`
- `PERF_LOGIN_SELECTOR_SUBMIT`
- `PERF_LOGIN_WAIT_URL`
- `PERF_LOGIN_WAIT_SELECTOR`
- `PERF_LOGIN_WAIT_AFTER`

### Autenticacion en el script standalone

El script standalone puede trabajar de dos formas:

1. contra URLs publicas, sin autenticacion
2. contra URLs protegidas, usando un `storageState`

Si defines `PERF_AUTH_STATE_PATH` y el archivo existe, se reutiliza directamente.

Si defines `PERF_AUTH_STATE_PATH` pero el archivo no existe, el script puede generarlo automaticamente si tambien se proporcionan `PERF_LOGIN_URL`, `PERF_LOGIN_USER` y `PERF_LOGIN_PASS` junto con los selectores necesarios si el formulario no encaja con los defaults.

Este enfoque es util para ejecutar performance fuera de Cucumber o desde CI como proceso independiente.

### Salida del script

El script deja siempre los artefactos de la ultima ejecucion en:

- `reports/performance/playwright/performance-kpis.json`
- `reports/performance/playwright/performance-kpis.html`

Y mantiene el historico acumulado en:

- `reports/performance/playwright/performance-history.json`
- `reports/performance/playwright/performance-history.html`

El historico permite comparar tendencias entre ejecuciones y visualizar el comportamiento de los KPIs a lo largo del tiempo.

## Performance con Gherkin

### Enfoque 2: Gherkin con contextos frescos y auth inyectado

Ademas del script standalone, el proyecto incorpora un flujo Cucumber para performance.

Feature actual:

```gherkin
Feature: Performance validation

  @performance @izertis
  Scenario: Izertis home page performance audit
		Given I am in Izertis home page
		When I audit performance
		Then performance audit should pass
```

### Por que existe este segundo enfoque

Este enfoque permite ejecutar la auditoria de performance desde un escenario BDD, igual que se hace con seguridad o accesibilidad, reutilizando los pasos de navegacion y login ya existentes en los tests end-to-end.

Es especialmente util cuando:

- la pagina a auditar requiere sesion autenticada
- quieres medir la pagina exacta en la que el test ya se encuentra
- quieres mostrar al equipo una integracion natural con el ecosistema Gherkin del proyecto

### Problema que resuelve

Medir directamente sobre `this.page` en Cucumber no es equivalente al script standalone, porque el contexto ya ha navegado y puede tener cache o estado acumulado.

Para evitar ese sesgo, este proyecto no mide sobre la pagina activa del scenario.

### Como funciona el flujo Gherkin

El flujo Gherkin de performance se apoya en el helper `performance/PerformanceRunner.ts`.

Su secuencia es esta:

1. el `Given` navega a la pagina objetivo usando una page object
2. el `When I audit performance` toma la URL actual del scenario
3. captura el `storageState` del contexto actual en un fichero temporal
4. lanza el script standalone `scripts/playwright-performance.ts`
5. le pasa dos datos clave:
   - `PERF_TARGET_URLS` con la URL actual del test
   - `PERF_AUTH_STATE_PATH` con el estado autenticado temporal
6. el script standalone vuelve a medir sobre contextos frescos por iteracion
7. se generan exactamente los mismos reportes que en el enfoque standalone
8. el helper lee `performance-kpis.json` y devuelve el resultado al step
9. el `Then` valida que el audit haya pasado

### Ventajas de este diseño

- mantiene el script original intacto
- evita duplicar la logica de calculo de metricas y reportes
- permite autenticar sin depender de un archivo manual persistente
- conserva medicion sobre contextos frescos
- genera exactamente los mismos artefactos de salida

### Ficheros implicados en el flujo Gherkin de performance

- `tests/features/performance.feature`
- `tests/steps/performanceSteps.ts`
- `tests/pages/IzertisHomePage.ts`
- `performance/PerformanceRunner.ts`
- `scripts/playwright-performance.ts`

### Ejecucion del flujo Gherkin de performance

```bash
npm run test:performance
```

En Windows, recuerda inicializar antes `fnm` y usar Node 22.

## Seguridad

La parte de seguridad sigue un modelo Cucumber + helper dedicado.

Feature actual:

```gherkin
Feature: Security validation

  @security
  Scenario: ECI home page security scan
		Given I am in ECI home page
		When I scan security
		Then security scan should pass
```

### Arquitectura de seguridad

El flujo se divide en tres capas:

1. `tests/steps/securitySteps.ts`
   - navega a la pagina objetivo
   - instancia el escaner
   - guarda el resultado en el world

2. `security/SecurityScanner.ts`
   - realiza el escaneo tecnico real sobre la pagina actual
   - resuelve politica, allowlist y score
   - construye el resultado final del scan

3. `security/SecurityReportWriter.ts`
   - escribe el JSON final
   - genera el dashboard HTML

### Que analiza el escaner de seguridad

Actualmente el helper ejecuta checks como:

- security headers
- cookie security
- local storage sensitive data
- mixed content
- clickjacking protection
- CSRF
- XSS probe
- open redirect
- form security
- console errors
- CORS policy audit
- subresource integrity
- third-party script risk
- permissions-policy
- cache-control en rutas sensibles
- TLS/HTTPS enforcement

Cada check produce issues con severidad y categoria. Despues se deduplican, se filtran por allowlist y se transforman en un resultado final con score y estado PASS/FAIL.

### Score de seguridad

El score parte de 100 y se penaliza segun la severidad de los issues efectivos.

Valores por defecto:

- local: `high=15`, `medium=7`, `low=3`, score minimo `75`
- ci: `high=20`, `medium=10`, `low=5`, score minimo `80`

Estos valores se pueden personalizar por variables de entorno:

- `SECURITY_MIN_SCORE`
- `SECURITY_MIN_SCORE_LOCAL`
- `SECURITY_MIN_SCORE_CI`
- `SECURITY_DEDUCTION_HIGH_LOCAL`
- `SECURITY_DEDUCTION_MEDIUM_LOCAL`
- `SECURITY_DEDUCTION_LOW_LOCAL`
- `SECURITY_DEDUCTION_HIGH_CI`
- `SECURITY_DEDUCTION_MEDIUM_CI`
- `SECURITY_DEDUCTION_LOW_CI`

### Allowlist de seguridad

El proyecto soporta exclusiones controladas mediante allowlist.

Fuentes posibles:

- fichero `security/allowlist.json`
- variable `SECURITY_ALLOWLIST_RULES_JSON`
- ruta alternativa mediante `SECURITY_ALLOWLIST_FILE`

Cada regla puede filtrar por:

- dominio
- path
- categorias
- motivo de exclusion

Los hallazgos ignorados por allowlist:

- no penalizan el score
- quedan reflejados en el dashboard
- mantienen trazabilidad del motivo de exclusion

### Reportes de seguridad

La salida de seguridad es:

- `reports/security/securityScan.json`
- `reports/security/securityDashboard.html`

Importante: el JSON de seguridad conserva solo el ultimo resultado para evitar confusion con historicos. El dashboard HTML muestra ese ultimo scan y el detalle por check.

### Ejecucion de seguridad

```bash
npm run test:security
```

## Estructura principal del proyecto

```text
.
├── docs/
├── performance/
│   └── PerformanceRunner.ts
├── reports/
│   ├── performance/
│   ├── security/
│   ├── screenshots/
│   ├── cucumber-report.html
│   └── cucumber-report.json
├── scripts/
│   ├── lighthouse.ts
│   └── playwright-performance.ts
├── security/
│   ├── SecurityChecks.ts
│   ├── SecurityPolicy.ts
│   ├── SecurityReportWriter.ts
│   ├── SecurityScanner.ts
│   ├── SecurityScore.ts
│   ├── allowlist.json
│   └── types.ts
├── tests/
│   ├── features/
│   ├── pages/
│   ├── steps/
│   └── support/
├── cucumber.js
├── package.json
├── playwright.config.ts
└── tsconfig.json
```

## Desarrollo

Compilacion en watch:

```bash
npx tsc --watch
```

Lint:

```bash
npm run lint
```

Formato:

```bash
npm run format
```

## Recomendaciones practicas

- usa el script standalone cuando quieras ejecutar performance como proceso tecnico independiente o en CI
- usa el flujo Gherkin cuando quieras auditar la pagina exacta en la que ya esta el scenario, especialmente si hay login previo
- usa seguridad como escaneo complementario, no como sustituto de un pentest o de un analisis de cabeceras desde infraestructura
- si trabajas en Windows, inicializa primero `fnm` y selecciona Node 22 antes de ejecutar los scripts npm

---

