import { When, Then, Given } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { ICustomWorld } from '../support/world';


Given('Estoy en la pagina de Club del Gourmet', async function (this: ICustomWorld) {
  if (!this.clubDelGourmetPage) throw new Error('ClubDelGourmetPage no ha sido inicializada');
  await this.clubDelGourmetPage.navigateToClubDelGourmet();
  const isOnClubDelGourmetPage = await this.clubDelGourmetPage.isOnClubDelGourmetPage();
  expect(isOnClubDelGourmetPage).toBe(true);
});

When('Hago click en la sección Club del Gourmet', async function (this: ICustomWorld) {
  if (!this.clubDelGourmetPage) throw new Error('ClubDelGourmetPage no ha sido inicializada');
  await this.clubDelGourmetPage.clickClubDelGourmet();
});

Then('Estoy en la sección de Club del Gourmet', async function (this: ICustomWorld) {
  if (!this.clubDelGourmetPage) throw new Error('ClubDelGourmetPage no ha sido inicializada');
  const isOnSection = await this.clubDelGourmetPage.isOnClubDelGourmetSection();
  expect(isOnSection).toBe(true);
});

