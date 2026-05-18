import { Given } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { ICustomWorld } from '../support/world';

Given('Estoy en la pagina de alimentación general del supermercado', async function (this: ICustomWorld) {
  if (!this.supermercadoAlimentacionGeneralPage) {
    throw new Error('SupermercadoAlimentacionGeneralPage no ha sido inicializada');
  }

  await this.supermercadoAlimentacionGeneralPage.navigateToAlimentacionGeneral();
  const isOnAlimentacionGeneral = await this.supermercadoAlimentacionGeneralPage.isOnAlimentacionGeneralPage();
  expect(isOnAlimentacionGeneral).toBe(true);
});