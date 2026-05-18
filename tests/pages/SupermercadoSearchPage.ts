import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

const SEARCH_URL_PART = '/supermercado/buscar';

export class SupermercadoSearchPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async isOnSearchResultsPage(): Promise<boolean> {
    await this.waitForUrl(/supermercado\/buscar/i, {
      timeout: 15000,
      waitUntil: 'domcontentloaded',
    });
    const currentUrl = await this.getCurrentUrl();
    return currentUrl.includes(SEARCH_URL_PART);
  }

  async isProductVisibleByName(name: string): Promise<boolean> {
    const locator = this.page.getByText(name, { exact: false });
    try {
      await locator.first().waitFor({ state: 'visible', timeout: 15000 });
      return await locator.first().isVisible();
    } catch {
      return false;
    }
  }

  async clickProductBySlug(slugPart: string): Promise<void> {
    const locator = this.page.locator(`a.food-product-preview-responsive__description[href*="${slugPart}"]`);
    await locator.first().click();
    await this.waitForLoadState();
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

