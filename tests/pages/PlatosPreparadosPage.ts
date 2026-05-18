import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

interface PlatosPreparadosSelectors {
  platosPreparadosLink: string;
  addToCartButton: string;
}

const PLATOS_PREPARADOS_URL = 'platos-preparados-de-nuestra-cocina';

export class PlatosPreparadosPage extends BasePage {
  private selectors: PlatosPreparadosSelectors;

  constructor(page: Page) {
    super(page);

    this.selectors = {
      platosPreparadosLink: 'a[href*="platos-preparados-de-nuestra-cocina"]',
      // Botón \"Añadir\" en la tarjeta de producto de la lista
      addToCartButton: 'button.food-product-preview-cart__add-button'
    };
  }

  get Selectors(): PlatosPreparadosSelectors {
    return this.selectors;
  }

  async clickPlatosPreparados(): Promise<void> {
    await this.waitForSelector(this.selectors.platosPreparadosLink, { state: 'visible' });
    await this.click(this.selectors.platosPreparadosLink);
    // Esperamos explícitamente a que la URL cambie a la sección de Platos Preparados
    await this.waitForUrl(new RegExp(PLATOS_PREPARADOS_URL), { timeout: 15000, waitUntil: 'domcontentloaded' });
  }

  async isOnPlatosPreparadosSection(): Promise<boolean> {
    // Aseguramos que la navegación haya terminado antes de comprobar
    await this.waitForUrl(new RegExp(PLATOS_PREPARADOS_URL), { timeout: 15000, waitUntil: 'domcontentloaded' });
    const currentUrl = await this.getCurrentUrl();
    return currentUrl.includes(PLATOS_PREPARADOS_URL);
  }

  async clickAddToCartButton(): Promise<void> {
    await this.waitForSelector(this.selectors.addToCartButton, { state: 'visible', timeout: 15000 });
    await this.page.locator(this.selectors.addToCartButton).first().click();
    await this.sleep(1000);
  }
}
