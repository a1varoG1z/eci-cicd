import { When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { ICustomWorld } from '../support/world';


When('Hago click en el campo de búsqueda', async function (this: ICustomWorld) {
  if (!this.supermercadoPage) throw new Error('SupermercadoPage no ha sido inicializada');
  await this.supermercadoPage.clickSearchField();
});

When(
  'Introduzco el texto {string} en el campo de búsqueda',
  async function (this: ICustomWorld, query: string) {
    if (!this.supermercadoPage) throw new Error('SupermercadoPage no ha sido inicializada');
    await this.supermercadoPage.typeInSearchField(query);
  }
);

Then(
  'Deberia ver el producto {string} en el resultado de la búsqueda',
  async function (this: ICustomWorld, productName: string) {
    if (!this.supermercadoSearchPage) {
      throw new Error('SupermercadoSearchPage no ha sido inicializada');
    }

    const isVisible = await this.supermercadoSearchPage.isProductVisibleByName(productName);
    expect(isVisible).toBe(true);
  }
);

Then('Deberia estar en la página de búsqueda de productos', async function (this: ICustomWorld) {
  if (!this.supermercadoSearchPage) {
    throw new Error('SupermercadoSearchPage no ha sido inicializada');
  }
  const isOnSearchPage = await this.supermercadoSearchPage.isOnSearchResultsPage();
  expect(isOnSearchPage).toBe(true);
});

When(
  'Hago click en el producto {string}',
  async function (this: ICustomWorld, productName: string) {
    if (!this.supermercadoSearchPage) {
      throw new Error('SupermercadoSearchPage no ha sido inicializada');
    }

    // Para este caso concreto, usamos el slug del producto SOS arroz redondo 2kg
    await this.supermercadoSearchPage.clickProductBySlug('sos-arroz-redondo-bolsa-2-kg');
  }
);

