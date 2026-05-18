import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

const DEFAULT_IZERTIS_HOME_URL = 'https://www.izertis.com/es/';

export class IzertisHomePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async navigateToHome(): Promise<void> {
    const targetUrl = process.env.BASE_URL_IZERTIS || DEFAULT_IZERTIS_HOME_URL;
    await this.navigateTo(targetUrl);
    await this.waitForLoadState('domcontentloaded');
    await this.waitForUrl(/https:\/\/www\.izertis\.com\/es\/?/i, {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    });
    await this.waitForSelector('body', { state: 'visible', timeout: 15000 });
  }
}