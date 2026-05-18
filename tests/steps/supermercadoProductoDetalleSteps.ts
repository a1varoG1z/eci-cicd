import { Given, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { ICustomWorld } from '../support/world';

// Mapeo entre el nombre legible del producto y el slug que aparece en la URL
const PRODUCT_NAME_TO_SLUG: Record<string, string> = {
  'Arroz Redondo Sos 2 kg': 'sos-arroz-redondo-bolsa-2-kg',
};

Given(
  'Estoy en la página de detalle de un producto',
  async function (this: ICustomWorld) {
    if (!this.productoDetallePage) {
      throw new Error('ProductoDetallePage no ha sido inicializada');
    }

    const url =
      'https://www.elcorteingles.es/supermercado/B001018005700820-sos-arroz-redondo-bolsa-2-kg/';

    await this.productoDetallePage.navigateTo(url);
    await this.productoDetallePage.waitForLoadState();
    await this.productoDetallePage.waitForUrl(url);

    const isOnDetail = await this.productoDetallePage.isOnProductDetailPageBySlug(
      'sos-arroz-redondo-bolsa-2-kg'
    );
    expect(isOnDetail).toBe(true);
  }
);

Then(
  'Estoy en la página de detalle del producto {string}',
  async function (this: ICustomWorld, productName: string) {
    if (!this.productoDetallePage) {
      throw new Error('ProductoDetallePage no ha sido inicializada');
    }

    const slug = PRODUCT_NAME_TO_SLUG[productName] ?? productName;

    const isOnDetailPage = await this.productoDetallePage.isOnProductDetailPageBySlug(slug);
    expect(isOnDetailPage).toBe(true);
  }
);

