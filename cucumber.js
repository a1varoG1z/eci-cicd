const config = {
  default: {
    requireModule: ['tsx'],
    require: [
      'tests/support/world.ts',
      'tests/support/hooks.ts',
      'tests/steps/**/*.ts'
    ],
    format: [
      '@cucumber/pretty-formatter',  // ✅ Esto mostrará todos los steps
      'html:reports/cucumber-report.html',
      'json:reports/cucumber-report.json'
    ],
    paths: ['tests/features/**/*.feature'],
    parallel: 1,
    dryRun: false,
    failFast: false
  }
};

module.exports = config;