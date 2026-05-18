import { When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { ICustomWorld } from '../support/world';


Then('Estoy en la sección de Platos Preparados', async function (this: ICustomWorld) {
  if (!this.platosPreparadosPage) throw new Error('PlatosPreparadosPage no ha sido inicializada');
  const isOnSection = await this.platosPreparadosPage.isOnPlatosPreparadosSection();
  expect(isOnSection).toBe(true);
});

When('Hago click en el botón de añadir al carrito', async function (this: ICustomWorld) {
  if (!this.platosPreparadosPage) throw new Error('PlatosPreparadosPage no ha sido inicializada');
  await this.platosPreparadosPage.clickAddToCartButton();
});
