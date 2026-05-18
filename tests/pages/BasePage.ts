import { Page } from '@playwright/test';

export class BasePage {
  protected page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async navigateTo(url: string): Promise<void> {
    await this.page.goto(url);
  }

  async getTitle(): Promise<string> {
    return await this.page.title();
  }

  async getCurrentUrl(): Promise<string> {
    return this.page.url();
  }

  async waitForSelector(selector: string, options: { state?: 'attached' | 'detached' | 'visible' | 'hidden'; timeout?: number } = {}): Promise<void> {
    await this.page.waitForSelector(selector, options);
  }

  async click(selector: string): Promise<void> {
    await this.page.click(selector);
  }

  async fill(selector: string, value: string): Promise<void> {
    await this.page.fill(selector, value);
  }

  async check(selector: string): Promise<void> {
    await this.page.check(selector);
  }

  async uncheck(selector: string): Promise<void> {
    await this.page.uncheck(selector);
  }

  async getText(selector: string): Promise<string | null> {
    return await this.page.textContent(selector);
  }

  async isVisible(selector: string): Promise<boolean> {
    return await this.page.isVisible(selector);
  }

  async isChecked(selector: string): Promise<boolean> {
    return await this.page.isChecked(selector);
  }

  async waitForUrl(url: string | RegExp, options: { timeout?: number; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit' } = {}): Promise<void> {
    await this.page.waitForURL(url, options);
  }

  async waitForLoadState(state: 'load' | 'domcontentloaded' | 'networkidle' = 'load'): Promise<void> {
    await this.page.waitForLoadState(state);
  }

  async screenshot(path: string): Promise<void> {
    await this.page.screenshot({ path });
  }

async sleep(timeOut: number = 1000): Promise<void> {
    await this.page.waitForTimeout(timeOut);
}

}
