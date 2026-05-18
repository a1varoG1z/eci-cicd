import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import { ICustomWorld } from "../support/world";
import { SecurityScanner } from "../../security/SecurityScanner";
import { SecurityResult } from "../../security/types";

async function navigateToSecurityTarget(this: ICustomWorld): Promise<void> {
  if (!this.page) {
    throw new Error("Page no ha sido inicializada");
  }

  const normalizeUrl = (value: string | undefined): string | null => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === "undefined" || trimmed.toLowerCase() === "null") {
      return null;
    }
    return trimmed;
  };

  const fallbackBase = "https://www.elcorteingles.es/";
  const targetUrl =
    normalizeUrl(process.env.SECURITY_TARGET_URL) ||
    normalizeUrl(process.env.BASE_URL_ECI) ||
    normalizeUrl(process.env.BASE_URL_SUPERMERCADO) ||
    fallbackBase;

  let response = await this.page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  if (!response || response.status() >= 400) {
    response = await this.page.goto(fallbackBase, { waitUntil: "domcontentloaded", timeout: 30000 });
  }

  if (!response || response.status() >= 400) {
    await this.page.goto(fallbackBase, { waitUntil: "domcontentloaded", timeout: 30000 });
  }
}

Given("I am in ECI home page", async function (this: ICustomWorld) {
  await navigateToSecurityTarget.call(this);
});

Given("I am in login page", async function (this: ICustomWorld) {
  await navigateToSecurityTarget.call(this);
});

When("I scan security", async function (this: ICustomWorld) {
  if (!this.page) {
    throw new Error("Page no ha sido inicializada");
  }

  const scanner = new SecurityScanner(this.page);
  const result = await scanner.scan();
  this.setTestData("securityResult", result);
});

Then("security scan should pass", async function (this: ICustomWorld) {
  const result = this.getTestData("securityResult") as SecurityResult | undefined;

  if (!result) {
    throw new Error("No se encontró resultado de security scan. Ejecuta 'I scan security' antes.");
  }

  expect(result.score).toBeGreaterThanOrEqual(result.threshold);
  expect(result.passed).toBe(true);
});
