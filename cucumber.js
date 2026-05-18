const config = {
  default: {
    requireModule: ['ts-node/register'],
    require: [
      'tests/support/world.ts',
      'tests/support/hooks.ts',
      'tests/steps/**/*.ts'
    ],
    format: [
      'progress-bar',
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