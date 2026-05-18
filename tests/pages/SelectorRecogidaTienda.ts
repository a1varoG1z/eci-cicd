import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

interface SelectorRecogidaTiendaSelectors {
  menuTitle: string;
  provinciasDropdownButton: string;
  provinciaItem: string;
  storeName: string;
  acceptButton: string;
}

export class SelectorRecogidaTienda extends BasePage {
  private selectors: SelectorRecogidaTiendaSelectors;

  constructor(page: Page) {
    super(page);
    this.selectors = {
      menuTitle: 'h2.food-center-selector__title',
      provinciasDropdownButton: 'button.food-center-selector__provinces-button',
      provinciaItem: 'button.food-center-selector__provinces-item',
      storeName: 'p.center-radio-button__name',
      acceptButton: 'button.food-center-selector__footer-accept-button',
    };
  }

  async waitForMenuVisible(timeout = 10000): Promise<void> {
    await this.page
      .locator(this.selectors.menuTitle)
      .filter({ hasText: 'Recogida en tienda' })
      .waitFor({ state: 'visible', timeout });
  }

  async isMenuRecogidaVisible(): Promise<boolean> {
    try {
      await this.page
        .locator(this.selectors.menuTitle)
        .filter({ hasText: 'Recogida en tienda' })
        .waitFor({ state: 'visible', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async clickProvinciasDropdown(): Promise<void> {
    await this.waitForSelector(this.selectors.provinciasDropdownButton, {
      state: 'visible',
      timeout: 10000,
    });
    await this.click(this.selectors.provinciasDropdownButton);
    await this.sleep(300);
  }

  async selectProvincia(provincia: string): Promise<void> {
    const option = this.page.locator(this.selectors.provinciaItem).filter({ hasText: provincia });
    await option.waitFor({ state: 'visible', timeout: 5000 });
    await option.click();
    await this.sleep(500);
  }

  async isTiendaVisible(tienda: string): Promise<boolean> {
    try {
      const locator = this.page.locator(this.selectors.storeName).filter({ hasText: tienda });
      await locator.waitFor({ state: 'visible', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async clickTienda(tienda: string): Promise<void> {
    const storeLocator = this.page.locator(this.selectors.storeName).filter({ hasText: tienda });
    await storeLocator.waitFor({ state: 'visible', timeout: 10000 });
    await storeLocator.click();
    await this.sleep(300);
  }

  async clickAceptar(): Promise<void> {
    await this.waitForSelector(this.selectors.acceptButton, { state: 'visible', timeout: 10000 });
    await this.click(this.selectors.acceptButton);
    await this.sleep(500);
  }
}
