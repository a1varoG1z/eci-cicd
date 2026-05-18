import { Given, Then, When } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { PerformanceRunner, PerformanceAuditResult } from '../../performance/PerformanceRunner';
import { ICustomWorld } from '../support/world';

Given('I am in Izertis home page', async function (this: ICustomWorld) {
  if (!this.izertisHomePage) {
    throw new Error('IzertisHomePage no ha sido inicializada');
  }

  await this.izertisHomePage.navigateToHome();
});

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