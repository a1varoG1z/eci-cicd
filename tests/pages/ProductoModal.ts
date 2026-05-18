import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

interface ProductoModalSelectors {
  root: string;
  addButton: string;
}

export class ProductoModal extends BasePage {
  private selectors: ProductoModalSelectors;

  constructor(page: Page) {
    super(page);
    this.selectors = {
      // Modal que se abre al hacer clic en \"Añadir\" en la tarjeta de producto
      root: '.additional-info-modal',
      // Botón \"Añadir\" dentro del modal
      addButton: '.additional-info-modal .product-controls__buttons-plp .product-button.products-controls__buy-button',
    };
  }

  async waitForVisible(timeout = 10000): Promise<void> {
    await this.waitForSelector(this.selectors.root, { state: 'visible', timeout });
  }

  async clickAdd(): Promise<void> {
    await this.waitForVisible();
    await this.waitForSelector(this.selectors.addButton, { state: 'visible', timeout: 10000 });
    await this.click(this.selectors.addButton);
    await this.sleep(500);
  }
}

