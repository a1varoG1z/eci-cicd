import { Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { ICustomWorld } from '../support/world';

Then('Deberia ver que la cantidad del carrito es mayor que 0', async function (this: ICustomWorld) {
  if (!this.supermercadoPage) throw new Error('SupermercadoPage no ha sido inicializada');
  await this.supermercadoPage.carrito.sleep(1500);
  const isGreaterThanZero = await this.supermercadoPage.carrito.isQuantityGreaterThanZero();
  expect(isGreaterThanZero).toBe(true);
});

