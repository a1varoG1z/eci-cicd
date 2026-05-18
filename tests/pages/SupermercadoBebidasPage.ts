import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class SupermercadoBebidasPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async navigateToBebidas(): Promise<void> {
    const url = 'https://www.elcorteingles.es/supermercado/bebidas/';
    await this.navigateTo(url);
    await this.waitForLoadState();
    await this.waitForUrl(url);
  }

  async isOnBebidasPage(): Promise<boolean> {
    const currentUrl = await this.getCurrentUrl();
    return currentUrl.includes('/supermercado/bebidas');
  }
}

