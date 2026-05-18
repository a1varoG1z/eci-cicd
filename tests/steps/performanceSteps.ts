import { Then, When } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { PerformanceRunner, PerformanceAuditResult } from '../../performance/PerformanceRunner';
import { ICustomWorld } from '../support/world';


When('I audit performance', async function (this: ICustomWorld) {
  if (!this.page) {
    throw new Error('Page no ha sido inicializada');
  }

  const runner = new PerformanceRunner(this.page);
  const result = await runner.audit();
  this.setTestData('performanceResult', result);
});

Then('performance audit should pass', async function (this: ICustomWorld) {
  const result = this.getTestData('performanceResult') as PerformanceAuditResult | undefined;

  if (!result) {
    throw new Error("No se encontró resultado de performance audit. Ejecuta 'I audit performance' antes.");
  }

  expect(result.report.checks).toBeTruthy();
  expect(result.report.passed).toBe(true);
  expect(result.passed).toBe(true);
});