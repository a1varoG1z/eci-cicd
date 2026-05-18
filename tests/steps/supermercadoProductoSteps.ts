import { When } from '@cucumber/cucumber';
import { ICustomWorld } from '../support/world';


When('Hago click en el boton añadir del desplegable', async function (this: ICustomWorld) {
  if (!this.supermercadoPage) throw new Error('SupermercadoPage no ha sido inicializada');
  await this.supermercadoPage.productoModal.clickAdd();
});

