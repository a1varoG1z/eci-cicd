import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

interface EciHomeSelectors {
  burgerButton: string;
  supermercadoMenuLevel1: string;
  supermercadoMenuLevel2: string;
  clubGourmetMenuLevel3: string;
  clubGourmetAllLevel4: string;
  joyeriaMenuLevel1: string;
  joyeriaAllLevel2: string;
  addToCartButtonJoyeria: string;
  joyeriaCartBadge: string;
}

const ECI_HOME_URL = 'https://www.elcorteingles.es/';
const CLUB_GOURMET_URL_PART = 'tienda-club-del-gourmet';
const JOYERIA_URL_PART = 'joyeria-y-relojes';

export class EciHomePage extends BasePage {
  private selectors: EciHomeSelectors;

  constructor(page: Page) {
    super(page);

    this.selectors = {
      burgerButton: '#burger-handler',
      supermercadoMenuLevel1: '#menulink_1_2',
      supermercadoMenuLevel2: 'a#menulink_2_0[href*="/supermercado/"]',
      clubGourmetMenuLevel3: '#menulink_3_19',
      clubGourmetAllLevel4: 'a#menulink_4_0[href*="tienda-club-del-gourmet"]',
      joyeriaMenuLevel1: 'a#menulink_1_4[href*="/joyeria-y-relojes/"]',
      joyeriaAllLevel2: 'a#menulink_2_0[aria-label*="Joyería y relojes"]',
      addToCartButtonJoyeria: 'button.pds-button:has-text("Añadir")',
      joyeriaCartBadge: 'span.icon-badge.pointer',
    };
  }

  async navigateToHome(): Promise<void> {
    await this.navigateTo(ECI_HOME_URL);
    await this.waitForLoadState('domcontentloaded');
    await this.waitForSelector(this.selectors.burgerButton, { state: 'visible', timeout: 15000 });
  }

  async navigateToSupermercadoClubDelGourmet(): Promise<void> {
    await this.click(this.selectors.burgerButton);

    await this.clickWithFallback([
      this.selectors.supermercadoMenuLevel1,
      'span:has-text("Supermercado")',
      '[role="menuitem"]:has-text("Supermercado")',
    ]);

    await this.clickWithFallback([
      this.selectors.supermercadoMenuLevel2,
      'a.linkMegadrop[href*="/supermercado/"]',
      'a[aria-label="Supermercado"]',
      'a:has-text("Supermercado")',
    ]);

    await this.clickWithFallback([
      this.selectors.clubGourmetMenuLevel3,
      'span:has-text("Club del Gourmet")',
      '[role="menuitem"]:has-text("Club del Gourmet")',
    ]);

    await this.clickWithFallback([
      this.selectors.clubGourmetAllLevel4,
      'a.linkMegadrop[href*="tienda-club-del-gourmet"]',
      'a[aria-label="Todo en Club del Gourmet"]',
      'a:has-text("Todo en Club del Gourmet")',
    ]);

    await this.waitForLoadState('domcontentloaded');
    await this.waitForUrl(new RegExp(CLUB_GOURMET_URL_PART), {
      timeout: 20000,
      waitUntil: 'domcontentloaded',
    });
  }

  async navigateToTodoJoyeriaYRelojes(): Promise<void> {
    await this.click(this.selectors.burgerButton);

    await this.clickWithFallback([
      this.selectors.joyeriaMenuLevel1,
      'a.linkMegadrop[href*="/joyeria-y-relojes/"]',
      'a[aria-label="Joyería y relojes"]',
      'a:has-text("Joyería y relojes")',
    ]);

    await this.clickWithFallback([
      this.selectors.joyeriaAllLevel2,
      'a.linkMegadrop[aria-label*="Todo en"][aria-label*="Joyería y relojes"]',
      'a.linkMegadrop:has-text("Todo en")',
      'a:has-text("Todo en  Joyería y relojes")',
      'a:has-text("Todo en Joyería y relojes")',
    ]);

    await this.waitForLoadState('domcontentloaded');
    await this.waitForUrl(new RegExp(JOYERIA_URL_PART), {
      timeout: 20000,
      waitUntil: 'domcontentloaded',
    });
  }

  async isOnTodoJoyeriaYRelojes(): Promise<boolean> {
    const currentUrl = await this.getCurrentUrl();
    return currentUrl.includes(JOYERIA_URL_PART);
  }

  async clickAddToCartInJoyeriaYRelojes(): Promise<void> {
    await this.waitForUrl(new RegExp(JOYERIA_URL_PART), {
      timeout: 20000,
      waitUntil: 'domcontentloaded',
    });

    const addButtons = this.page.locator(this.selectors.addToCartButtonJoyeria);
    await addButtons.first().waitFor({ state: 'visible', timeout: 15000 });
    await addButtons.first().click();

    await this.page.waitForTimeout(1000);
  }

  async getJoyeriaCartBadgeCount(): Promise<number> {
    await this.waitForSelector(this.selectors.joyeriaCartBadge, { state: 'visible', timeout: 15000 });
    const text = await this.getText(this.selectors.joyeriaCartBadge);
    const parsed = parseInt((text ?? '').trim(), 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private async clickWithFallback(selectors: string[]): Promise<void> {
    let lastError: Error | null = null;

    for (const selector of selectors) {
      try {
        const locator = this.page.locator(selector).first();
        await locator.waitFor({ state: 'visible', timeout: 6000 });
        await locator.click();
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw new Error(
      `No se pudo hacer click con ninguno de los selectores: ${selectors.join(' | ')}. ` +
      `Último error: ${lastError?.message || 'N/A'}`
    );
  }
}
