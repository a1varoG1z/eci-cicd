import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

interface ClubDelGourmetSelectors {
  clubDelGourmetLink: string;
}

const CLUB_DEL_GOURMET_URL_PART = 'tienda-club-del-gourmet';

export class ClubDelGourmetPage extends BasePage {
  private selectors: ClubDelGourmetSelectors;

  constructor(page: Page) {
    super(page);

    this.selectors = {
      clubDelGourmetLink: 'a[href*="tienda-club-del-gourmet"]',
    };
  }

  async navigateToClubDelGourmet(): Promise<void> {
    const url = 'https://www.elcorteingles.es/supermercado/tienda-club-del-gourmet/';
    await this.navigateTo(url);
    await this.waitForLoadState();
    await this.waitForUrl(url);
  }

  async isOnClubDelGourmetPage(): Promise<boolean> {
    const currentUrl = await this.getCurrentUrl();
    return currentUrl.includes(CLUB_DEL_GOURMET_URL_PART);
  }

  async clickClubDelGourmet(): Promise<void> {
    await this.waitForSelector(this.selectors.clubDelGourmetLink, { state: 'visible' });
    await this.click(this.selectors.clubDelGourmetLink);
    await this.waitForUrl(new RegExp(CLUB_DEL_GOURMET_URL_PART), {
      timeout: 15000,
      waitUntil: 'domcontentloaded',
    });
  }

  async isOnClubDelGourmetSection(): Promise<boolean> {
    await this.waitForUrl(new RegExp(CLUB_DEL_GOURMET_URL_PART), {
      timeout: 15000,
      waitUntil: 'domcontentloaded',
    });
    const currentUrl = await this.getCurrentUrl();
    return currentUrl.includes(CLUB_DEL_GOURMET_URL_PART);
  }
}

