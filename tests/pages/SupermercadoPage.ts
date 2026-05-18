import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { EntregaModal } from './EntregaModal';
import { SelectorRecogidaTienda } from './SelectorRecogidaTienda';
import { Carrito } from './Carrito';
import { ProductoModal } from './ProductoModal';

interface SupermercadoSelectors {
  continueWithoutIdentifyButton: string;
  searchButton: string;
}

export class SupermercadoPage extends BasePage {
  private selectors: SupermercadoSelectors;
  private _entregaModal: EntregaModal;
  private _selectorRecogidaTienda: SelectorRecogidaTienda;
  private _carrito: Carrito;
  private _productoModal: ProductoModal;

  constructor(page: Page) {
    super(page);

    this.selectors = {
      continueWithoutIdentifyButton: 'button.food-identify-user-modal__content-link',
      searchButton: '#searchBoxBtn',
    };
    this._entregaModal = new EntregaModal(page);
    this._selectorRecogidaTienda = new SelectorRecogidaTienda(page);
    this._carrito = new Carrito(page);
    this._productoModal = new ProductoModal(page);
  }

  get entregaModal(): EntregaModal {
    return this._entregaModal;
  }

  get selectorRecogidaTienda(): SelectorRecogidaTienda {
    return this._selectorRecogidaTienda;
  }

  get carrito(): Carrito {
    return this._carrito;
  }

  get productoModal(): ProductoModal {
    return this._productoModal;
  }

  async navigateToSupermercado(): Promise<void> {
    await this.navigateTo(process.env.BASE_URL_SUPERMERCADO!);
    await this.waitForLoadState();
    await this.waitForUrl(process.env.BASE_URL_SUPERMERCADO!);
  }
  async isOnSupermercadoPage(): Promise<boolean> {
    const currentUrl = await this.getCurrentUrl();
    return currentUrl.includes('elcorteingles.es/supermercado');
  }

  async clickSearchField(): Promise<void> {
    await this.waitForSelector(this.selectors.searchButton, {
      state: 'visible',
      timeout: 10000,
    });
    await this.click(this.selectors.searchButton);
    await this.sleep(500);
  }

  async typeInSearchField(query: string): Promise<void> {
    // El click previo en el campo de búsqueda deja el foco listo para escribir,
    // así que escribimos directamente con el teclado para evitar problemas de selectores internos.
    await this.page.keyboard.type(query, { delay: 50 });
    await this.page.keyboard.press('Enter');
    await this.sleep(1000);
  }

  async clickContinueWithoutIdentify(): Promise<void> {
    await this.waitForSelector(this.selectors.continueWithoutIdentifyButton, {
      state: 'visible',
      timeout: 10000,
    });
    await this.click(this.selectors.continueWithoutIdentifyButton);
    await this.sleep(500);
  }
}