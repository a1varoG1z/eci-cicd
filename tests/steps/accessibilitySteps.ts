import { When, Then } from '@cucumber/cucumber';
import { ICustomWorld } from '../support/world';
import { logAccessibilityViolations } from '../support/accessibility';


When('La página ha cargado por completo', async function (this: ICustomWorld) {
  if (!this.page) {
    throw new Error('Page no ha sido inicializada');
  }
  await this.page.waitForSelector('#food-header-grid', {
    state: 'visible',
    timeout: 15000,
  });
  await this.page.waitForLoadState('load');
});

Then('Compruebo que la página es accesible', async function (this: ICustomWorld) {
  if (!this.page) throw new Error('Page no ha sido inicializada');
  await logAccessibilityViolations(this.page);
});

Then('Compruebo que el modal de entrega es accesible', async function (this: ICustomWorld) {
  if (!this.page) throw new Error('Page no ha sido inicializada');
  await logAccessibilityViolations(this.page, 'modal-entrega');
});

Then('Compruebo que el modal de identificación es accesible', async function (this: ICustomWorld) {
  if (!this.page) throw new Error('Page no ha sido inicializada');
  await logAccessibilityViolations(this.page, 'modal-identificacion');
});

