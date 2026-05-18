import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class SupermercadoAlimentacionGeneralPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async navigateToAlimentacionGeneral(): Promise<void> {
    const url = 'https://www.elcorteingles.es/supermercado/alimentacion-general/';
    await this.navigateTo(url);
    await this.waitForLoadState();
    await this.waitForUrl(url);
  }

  async isOnAlimentacionGeneralPage(): Promise<boolean> {
    const currentUrl = await this.getCurrentUrl();
    return currentUrl.includes('/supermercado/alimentacion-general');
  }
}

