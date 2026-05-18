import { When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { ICustomWorld } from '../support/world';

Then('Deberia ver el menu de eleccion de entrega', async function (this: ICustomWorld) {
  if (!this.supermercadoPage) throw new Error('SupermercadoPage no ha sido inicializada');
  const isVisible = await this.supermercadoPage.entregaModal.isMenuVisible();
  expect(isVisible).toBe(true);
});

When('Hago click en Recogida', async function (this: ICustomWorld) {
  if (!this.supermercadoPage) throw new Error('SupermercadoPage no ha sido inicializada');
  await this.supermercadoPage.entregaModal.clickRecogida();
});

Then('Deberia ver el menu de recogida en tienda', async function (this: ICustomWorld) {
  if (!this.supermercadoPage) throw new Error('SupermercadoPage no ha sido inicializada');
  const isVisible = await this.supermercadoPage.selectorRecogidaTienda.isMenuRecogidaVisible();
  expect(isVisible).toBe(true);
});

When('Hago click en el desplegable de provincias', async function (this: ICustomWorld) {
  if (!this.supermercadoPage) throw new Error('SupermercadoPage no ha sido inicializada');
  await this.supermercadoPage.selectorRecogidaTienda.clickProvinciasDropdown();
});

When('Selecciono {string} en el desplegable de provincias', async function (
  this: ICustomWorld,
  provincia: string
) {
  if (!this.supermercadoPage) throw new Error('SupermercadoPage no ha sido inicializada');
  await this.supermercadoPage.selectorRecogidaTienda.selectProvincia(provincia);
});

Then(
  'Deberia ver la opcion {string} entre las tiendas a seleccionar',
  async function (this: ICustomWorld, tienda: string) {
    if (!this.supermercadoPage) throw new Error('SupermercadoPage no ha sido inicializada');
    const isVisible = await this.supermercadoPage.selectorRecogidaTienda.isTiendaVisible(tienda);
    expect(isVisible).toBe(true);
  }
);

When('Hago click en {string} en tiendas', async function (this: ICustomWorld, tienda: string) {
  if (!this.supermercadoPage) throw new Error('SupermercadoPage no ha sido inicializada');
  await this.supermercadoPage.selectorRecogidaTienda.clickTienda(tienda);
});

When('Hago click en el boton Aceptar', async function (this: ICustomWorld) {
  if (!this.supermercadoPage) throw new Error('SupermercadoPage no ha sido inicializada');
  await this.supermercadoPage.selectorRecogidaTienda.clickAceptar();
});
