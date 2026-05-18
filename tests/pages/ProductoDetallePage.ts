import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

export class ProductoDetallePage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async isOnProductDetailPageBySlug(slugPart: string): Promise<boolean> {
    await this.waitForUrl(new RegExp(slugPart), {
      timeout: 15000,
      waitUntil: 'domcontentloaded',
    });
    const currentUrl = await this.getCurrentUrl();
    return currentUrl.includes(slugPart);
  }
}

