import { setWorldConstructor, World, IWorldOptions } from '@cucumber/cucumber';
import { Browser, BrowserContext, Page, chromium, firefox, webkit } from '@playwright/test';

import { SupermercadoPage } from '../pages/SupermercadoPage';
import { SupermercadoSearchPage } from '../pages/SupermercadoSearchPage';
import { PlatosPreparadosPage } from '../pages/PlatosPreparadosPage';
import { ClubDelGourmetPage } from '../pages/ClubDelGourmetPage';
import { ProductoDetallePage } from '../pages/ProductoDetallePage';
import { SupermercadoBebidasPage } from '../pages/SupermercadoBebidasPage';
import { SupermercadoAlimentacionGeneralPage } from '../pages/SupermercadoAlimentacionGeneralPage';
import { EciHomePage } from '../pages/EciHomePage';
import { IzertisHomePage } from '../pages/IzertisHomePage';

export interface ICustomWorld extends World {
  browser: Browser | null;
  context: BrowserContext | null;
  page: Page | null;
  supermercadoPage: SupermercadoPage | null;
  platosPreparadosPage: PlatosPreparadosPage | null;
  clubDelGourmetPage: ClubDelGourmetPage | null;
  supermercadoSearchPage: SupermercadoSearchPage | null;
  productoDetallePage: ProductoDetallePage | null;
  supermercadoBebidasPage: SupermercadoBebidasPage | null;
  supermercadoAlimentacionGeneralPage: SupermercadoAlimentacionGeneralPage | null;
  eciHomePage: EciHomePage | null;
  izertisHomePage: IzertisHomePage | null;
  testData: Record<string, any>;
  alertMessage: string;
  openBrowser(browserType?: 'chromium' | 'firefox' | 'webkit' | 'electron'): Promise<void>;
  closeBrowser(): Promise<void>;
  takeScreenshot(name: string): Promise<void>;
  setTestData(key: string, value: any): void;
  getTestData(key: string): any;
  clearTestData(): void;
}

export class CustomWorld extends World implements ICustomWorld {
  browser: Browser | null;
  context: BrowserContext | null;
  page: Page | null;
  supermercadoPage: SupermercadoPage | null;
  platosPreparadosPage: PlatosPreparadosPage | null;
  clubDelGourmetPage: ClubDelGourmetPage | null;
  supermercadoSearchPage: SupermercadoSearchPage | null;
  productoDetallePage: ProductoDetallePage | null;
  supermercadoBebidasPage: SupermercadoBebidasPage | null;
  supermercadoAlimentacionGeneralPage: SupermercadoAlimentacionGeneralPage | null;
  eciHomePage: EciHomePage | null;
  izertisHomePage: IzertisHomePage | null;
  testData: Record<string, any>;
  alertMessage: string;

  constructor(options: IWorldOptions) {
    super(options);
    
    this.browser = null;
    this.context = null;
    this.page = null;
    
    this.supermercadoPage = null;
    this.platosPreparadosPage = null;
    this.clubDelGourmetPage = null;
    this.supermercadoSearchPage = null;
    this.productoDetallePage = null;
    this.supermercadoBebidasPage = null;
    this.supermercadoAlimentacionGeneralPage = null;
    this.eciHomePage = null;
    this.izertisHomePage = null;

    this.testData = {};
    this.alertMessage = '';
  }

  async openBrowser(browserType: 'chromium' | 'firefox' | 'webkit' | 'electron' = 'chromium'): Promise<void> {
    const resolvedBrowserType = browserType === 'electron' ? 'chromium' : browserType;
    const browserOptions: { headless: boolean; slowMo: number; args?: string[] } = {
      headless: process.env.HEADLESS === 'true',
      slowMo: process.env.SLOW_MO ? parseInt(process.env.SLOW_MO) : 0
    };

     // Chromium: evitar ERR_HTTP2_PROTOCOL_ERROR y reducir detección de automatización
    if (resolvedBrowserType === 'chromium') {
      browserOptions.args = [
        //'--disable-http2',
        //'--disable-features=Http2ServerPush',
        '--disable-blink-features=AutomationControlled',
       // '--no-sandbox',
       // '--disable-setuid-sandbox',
       // '--disable-dev-shm-usage',
       // '--disable-web-security',
       // '--disable-features=IsolateOrigins,site-per-process'
      ];
    } 

    switch (resolvedBrowserType) {
      case 'firefox':
        this.browser = await firefox.launch(browserOptions);
        break;
      case 'webkit':
        this.browser = await webkit.launch(browserOptions);
        break;
      default:
        this.browser = await chromium.launch(browserOptions);
    }

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'es-ES',
      extraHTTPHeaders: {
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });

    this.page = await this.context.newPage();
    
    this.page.on('dialog', async (dialog) => {
      this.alertMessage = dialog.message();
      await dialog.accept();
    });


    this.supermercadoPage = new SupermercadoPage(this.page);
    this.platosPreparadosPage = new PlatosPreparadosPage(this.page);
    this.clubDelGourmetPage = new ClubDelGourmetPage(this.page);
    this.supermercadoSearchPage = new SupermercadoSearchPage(this.page);
    this.productoDetallePage = new ProductoDetallePage(this.page);
    this.supermercadoBebidasPage = new SupermercadoBebidasPage(this.page);
    this.supermercadoAlimentacionGeneralPage = new SupermercadoAlimentacionGeneralPage(this.page);
    this.eciHomePage = new EciHomePage(this.page);
    this.izertisHomePage = new IzertisHomePage(this.page);
  }

  async closeBrowser(): Promise<void> {
    if (this.context) {
      await this.context.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
  }

  async takeScreenshot(name: string): Promise<void> {
    if (this.page) {
      await this.page.screenshot({ 
        path: `reports/screenshots/${name}-${Date.now()}.png`,
        fullPage: true 
      });
    }
  }

  setTestData(key: string, value: any): void {
    this.testData[key] = value;
  }

  getTestData(key: string): any {
    return this.testData[key];
  }

  clearTestData(): void {
    this.testData = {};
    this.alertMessage = '';
  }
}

setWorldConstructor(CustomWorld);
