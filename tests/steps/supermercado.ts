import { Given, When } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { ICustomWorld } from '../support/world';

Given('Estoy en la pagina de supermercado', async function (this: ICustomWorld) {
  if (!this.supermercadoPage) throw new Error('Supermercado ECI no ha sido inicializada');
  await this.supermercadoPage.navigateToSupermercado();
  const isOnSupermercadoPage = await this.supermercadoPage.isOnSupermercadoPage();
  expect(isOnSupermercadoPage).toBe(true);
});

When('Hago click en Continuar sin identificarme', async function (this: ICustomWorld) {
  if (!this.supermercadoPage) throw new Error('Supermercado ECI no ha sido inicializada');
  await this.supermercadoPage.clickContinueWithoutIdentify();
});

When('Hago click en la sección Platos Preparados', async function (this: ICustomWorld) {
  if (!this.platosPreparadosPage) throw new Error('PlatosPreparadosPage no ha sido inicializada');
  await this.platosPreparadosPage.clickPlatosPreparados();
});


