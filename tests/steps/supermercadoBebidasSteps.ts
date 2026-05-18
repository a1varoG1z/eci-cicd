import { Given, When } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { ICustomWorld } from '../support/world';


Given('Estoy en la pagina de bebidas del supermercado', async function (this: ICustomWorld) {
  if (!this.supermercadoBebidasPage) {
    throw new Error('SupermercadoBebidasPage no ha sido inicializada');
  }

  await this.supermercadoBebidasPage.navigateToBebidas();
  const isOnBebidasPage = await this.supermercadoBebidasPage.isOnBebidasPage();
  expect(isOnBebidasPage).toBe(true);
});


