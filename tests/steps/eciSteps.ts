import { Given, Then, When } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { ICustomWorld } from '../support/world';

Given('Estoy en la pagina de inicio de El Corte Ingles', async function (this: ICustomWorld) {
  if (!this.eciHomePage) throw new Error('EciHomePage no ha sido inicializada');
  await this.eciHomePage.navigateToHome();
});

Given('Estoy en la pagina de inicio de El Corte Inglés', async function (this: ICustomWorld) {
  if (!this.eciHomePage) throw new Error('EciHomePage no ha sido inicializada');
  await this.eciHomePage.navigateToHome();
});

When('Navego a la sección de supermercado club del gourmet', async function (this: ICustomWorld) {
  if (!this.eciHomePage) throw new Error('EciHomePage no ha sido inicializada');
  await this.eciHomePage.navigateToSupermercadoClubDelGourmet();
});

When('Navego a la sección de todo en joyería y relojes', async function (this: ICustomWorld) {
  if (!this.eciHomePage) throw new Error('EciHomePage no ha sido inicializada');
  await this.eciHomePage.navigateToTodoJoyeriaYRelojes();
});

When('Navego a la sección de todo en joyeria y relojes', async function (this: ICustomWorld) {
  if (!this.eciHomePage) throw new Error('EciHomePage no ha sido inicializada');
  await this.eciHomePage.navigateToTodoJoyeriaYRelojes();
});

Then('Estoy en la sección de todo en joyería y relojes', async function (this: ICustomWorld) {
  if (!this.eciHomePage) throw new Error('EciHomePage no ha sido inicializada');
  const isOnSection = await this.eciHomePage.isOnTodoJoyeriaYRelojes();
  expect(isOnSection).toBe(true);
});

Then('Estoy en la sección de todo en joyeria y relojes', async function (this: ICustomWorld) {
  if (!this.eciHomePage) throw new Error('EciHomePage no ha sido inicializada');
  const isOnSection = await this.eciHomePage.isOnTodoJoyeriaYRelojes();
  expect(isOnSection).toBe(true);
});

When('Hago click en el botón de añadir al carrito en todo en joyería y relojes', async function (this: ICustomWorld) {
  if (!this.eciHomePage) throw new Error('EciHomePage no ha sido inicializada');
  await this.eciHomePage.clickAddToCartInJoyeriaYRelojes();
});

When('Hago click en el botón de añadir al carrito en todo en joyeria y relojes', async function (this: ICustomWorld) {
  if (!this.eciHomePage) throw new Error('EciHomePage no ha sido inicializada');
  await this.eciHomePage.clickAddToCartInJoyeriaYRelojes();
});

Then('Deberia ver que la cesta de joyería y relojes es 1', async function (this: ICustomWorld) {
  if (!this.eciHomePage) throw new Error('EciHomePage no ha sido inicializada');
  const badgeCount = await this.eciHomePage.getJoyeriaCartBadgeCount();
  expect(badgeCount).toBe(1);
});

Then('Deberia ver que la cesta de joyeria y relojes es 1', async function (this: ICustomWorld) {
  if (!this.eciHomePage) throw new Error('EciHomePage no ha sido inicializada');
  const badgeCount = await this.eciHomePage.getJoyeriaCartBadgeCount();
  expect(badgeCount).toBe(1);
});
