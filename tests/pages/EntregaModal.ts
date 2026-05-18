import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

interface EntregaModalSelectors {
  menuTitle: string;
  recogidaButton: string;
}

export class EntregaModal extends BasePage {
  private selectors: EntregaModalSelectors;

  constructor(page: Page) {
    super(page);
    this.selectors = {
      menuTitle: 'h2.modal-header-title',
      recogidaButton: 'button.select-delivery-type-modal__select-button',
    };
  }

  async waitForMenuVisible(timeout = 10000): Promise<void> {
    await this.page
      .locator(this.selectors.menuTitle)
      .filter({ hasText: 'Elige forma de entrega' })
      .waitFor({ state: 'visible', timeout });
  }

  async isMenuVisible(): Promise<boolean> {
    try {
      await this.page
        .locator(this.selectors.menuTitle)
        .filter({ hasText: 'Elige forma de entrega' })
        .waitFor({ state: 'visible', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async clickRecogida(): Promise<void> {
    // En el modal hay dos tipos de entrega: Envío y Recogida.
    // Aseguramos seleccionar específicamente la opción \"Recogida\".
    const recogidaCard = this.page
      .locator('li.select-delivery-type-modal__delivery-type')
      .filter({ hasText: 'Recogida' });

    await recogidaCard.waitFor({ state: 'visible', timeout: 10000 });
    await recogidaCard.locator(this.selectors.recogidaButton).first().click();
    await this.sleep(500);
  }
}
