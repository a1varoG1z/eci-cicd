---


# Framework de Testing BDD con Playwright, Cucumber y TypeScript

Este proyecto implementa un **framework de testing automatizado** usando **Playwright**, **Cucumber** (BDD), **Gherkin**, **TypeScript** y **Page Object Model (POM)** para probar la aplicación web supermercado de ECI.

---

## Instalacion y Configuracion

### 1. Inicializar proyecto e instalar dependencias
Para poder instalar y ejecutar el proyecto, es necesario disponer de un ordenador que tenga instado:
* Node.js (recomendadad version 24.x
* GIT

Una vez dispongamos de Node y GIT, Los pasos para la instalacion son los siguientes:

1. Clonar este proyecto en la carpeta destino que deseemos en nuestro ordenador

```git

```

2. Entrar a la carpeta en la que hayamos instalado nuestro proyecto y ejecutar el siguiente comando

```bash
npm run init
```


---

## Ejecutar Tests en nuestro ordenador (Modo local)

### Ejecutar todos los tests en modo headless (Navegador visible)

```bash
npm run test:local
```

### Ejecucion ralentizada

Los test se ejecutan a gran velocidad, por lo que es posible que no de tiempo a visuablizar correctamente las interacciones del framework con el frontal de la aplicacion web. Por ello, podemos ejecutarlos a una velocidad menor.

```bash
npm run test:local:slow
```

### Ejecutar todos los tests en modo headless (navegador no visible)

```bash
npm test:local:headless
```

### Ejecutar tests en navegadores especificos

| Script                          | Navegador | Headless |
| ------------------------------- | --------- | -------- |
| `npm run test:chromium`         | Chromium  | true     |
| `npm run test:firefox`          | Firefox   | false    |
| `npm run test:webkit`           | WebKit    | false    |
| `npm run test:firefox:headless` | Firefox   | true     |
| `npm run test:webkit:headless`  | WebKit    | true     |

### Ejecutar tests segun etiquetado (tags)

Es posible ejecutar subconjuntos de tests, segunb su etiquetado. Por ejemplo, podemos ejecutar solo los tests automatizados referentes a la regresion o a la accesibilidad por separado.

| Script                          | Etiqueta  |
| ------------------------------- | --------- |
| `npm run test:regression`            | login     | # Solo tests con tag @login
| `npm run test:accessibility`          | private   | # Solo tests con tag @private
---


## Reportes

Los reportes se generan automaticamente en:

* HTML: `reports/cucumber-report.html`
* JSON: `reports/cucumber-report.json`
* Screenshots: `reports/screenshots/`
* Accesibilidad: `reports/accessibility`

---

## Estructura del Proyecto

```
├── tests/
│   ├── features/           # Scenarios en Gherkin (.feature)
│   ├── pages/              # Page Object Model (TypeScript)
│   ├── steps/              # Implementacion de steps (TypeScript)
│   └── support/            # Configuracion, hooks y accesibilidad (TypeScript)
│       ├── accessibility.ts
│       ├── world.ts
│       └── hooks.ts
├── reports/                # Reportes y screenshots
│      ├── accessibility/
│      ├── screenshots/
│      ├── cucumber-report.html
│      └── cucumber-report.json            
├── cucumber.js             # Configuracion de Cucumber
├── playwright.config.ts    # Configuracion de Playwright
├── tsconfig.json           # Configuracion de TypeScript
└── package.json            # Dependencias y scripts
```

---

## Tecnologias Utilizadas

* **TypeScript**: Tipado estatico y robustez
* **Playwright**: Automatizacion de navegadores
* **Cucumber**: BDD para escribir tests en lenguaje natural
* **Gherkin**: Lenguaje para definir escenarios de prueba
* **Page Object Model**: Patron de diseno para organizar el codigo

---

## Desarrollo

### Compilar en modo watch

```bash
npx tsc --watch
```

### Ejecutar linter

```bash
npm run lint
```

### Formatear codigo

```bash
npm run format
```

---

## Debugging

1. Usa VS Code con extension de Cucumber
2. Anade breakpoints en archivos `.ts`
3. Ejecuta con `npm run test`

---
