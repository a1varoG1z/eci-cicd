import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

interface CarritoSelectors {
  // Dígito de la cantidad de productos en el carrito flotante
  cartDigit: string;
  // Total mostrado en el carrito flotante (importe)
  cartTotal: string;
}

export class Carrito extends BasePage {
  private selectors: CarritoSelectors;

  constructor(page: Page) {
    super(page);

    this.selectors = {
      cartDigit: '.new-mini-cart__container__ballon__digit',
      cartTotal: '.new-mini-cart__container__total',
    };
  }

  async getQuantity(): Promise<number> {
    // Esperamos a que aparezca el globito con la cantidad
    await this.waitForSelector(this.selectors.cartDigit, { state: 'visible', timeout: 10000 });
    const text = await this.getText(this.selectors.cartDigit);
    const trimmed = (text ?? '').trim();
    const parsed = parseInt(trimmed, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  async getTotalAmount(): Promise<number> {
    await this.waitForSelector(this.selectors.cartTotal, { state: 'visible', timeout: 10000 });
    const text = await this.getText(this.selectors.cartTotal);
    const normalized = (text ?? '').replace('€', '').trim().replace(',', '.');
    const parsed = parseFloat(normalized);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  async isQuantityGreaterThanZero(): Promise<boolean> {
    const quantity = await this.getQuantity();
    return quantity > 0;
  }
}

