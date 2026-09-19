import { expect, type Page } from "@playwright/test";
import type { CaseFile, Expectation, Step } from "../cases/types.ts";
import { loc, openFresh, openMenu } from "./helpers.ts";

function idsOf(exp: Expectation): string[] {
  return (Array.isArray(exp.testId) ? exp.testId : [exp.testId]).map(String);
}

async function applyExpect(page: Page, exp: Expectation, caseId: string): Promise<void> {
  const tag = `${caseId}/${exp.assert}`;
  switch (exp.assert) {
    case "visible":
      await expect(loc(page, String(exp.testId)), tag).toBeVisible();
      return;
    case "hidden":
      await expect(loc(page, String(exp.testId)), tag).toBeHidden();
      return;
    case "title":
      await expect(page, tag).toHaveTitle(new RegExp(String(exp.match)));
      return;
    case "heading":
      await expect(page.getByRole("heading", { name: String(exp.name) }).first(), tag).toBeVisible();
      return;
    case "text":
      await expect(loc(page, String(exp.testId)), tag).toHaveText(new RegExp(String(exp.match)));
      return;
    case "viewport": {
      const vp = page.viewportSize();
      expect(vp, tag).toEqual({ width: Number(exp.width), height: Number(exp.height) });
      return;
    }
    case "path": {
      const path = new URL(page.url()).pathname;
      expect(path, tag).toMatch(new RegExp(String(exp.match)));
      return;
    }
    case "iframeSrc": {
      const src = await page.locator("#play iframe").getAttribute("src");
      expect(src, tag).toBeTruthy();
      expect(src, tag).toMatch(new RegExp(String(exp.match)));
      return;
    }
    case "ctaFilled": {
      const match = new RegExp(String(exp.match ?? "play"), "i");
      for (const id of idsOf(exp)) {
        const card = loc(page, id);
        await card.scrollIntoViewIfNeeded();
        await expect(card, `${tag} ${id}`).toBeVisible();
        const cta = card.getByTestId("cta");
        await expect(cta, `${tag} ${id} cta`).toBeVisible();
        const text = (await cta.innerText()).trim();
        expect(text.length, `${tag} ${id} empty CTA`).toBeGreaterThan(0);
        expect(text, `${tag} ${id} CTA`).toMatch(match);
      }
      return;
    }
    case "inViewport":
    case "noVerticalClip": {
      const vp = page.viewportSize()!;
      for (const id of idsOf(exp)) {
        const box = await loc(page, id).boundingBox();
        expect(box, `${tag} ${id}`).toBeTruthy();
        expect(box!.y, `${tag} ${id} top`).toBeGreaterThanOrEqual(-2);
        expect(box!.y + box!.height, `${tag} ${id} bottom`).toBeLessThanOrEqual(vp.height + 2);
        expect(box!.x, `${tag} ${id} left`).toBeGreaterThanOrEqual(-2);
        expect(box!.x + box!.width, `${tag} ${id} right`).toBeLessThanOrEqual(vp.width + 2);
      }
      return;
    }
    case "noHorizontalClip": {
      const vp = page.viewportSize()!;
      for (const id of idsOf(exp)) {
        const el = loc(page, id);
        await el.scrollIntoViewIfNeeded();
        const box = await el.boundingBox();
        expect(box, `${tag} ${id}`).toBeTruthy();
        expect(box!.x, `${tag} ${id} left`).toBeGreaterThanOrEqual(-2);
        expect(box!.x + box!.width, `${tag} ${id} right`).toBeLessThanOrEqual(vp.width + 2);
      }
      return;
    }
    case "cardsUsable": {
      const minW = Number(exp.minWidth ?? 180);
      const minH = Number(exp.minHeight ?? 160);
      for (const id of idsOf(exp)) {
        const card = loc(page, id);
        await card.scrollIntoViewIfNeeded();
        const box = await card.boundingBox();
        expect(box, `${tag} ${id}`).toBeTruthy();
        expect(box!.width, `${tag} ${id} width`).toBeGreaterThanOrEqual(minW);
        expect(box!.height, `${tag} ${id} height`).toBeGreaterThanOrEqual(minH);
        await expect(card.getByRole("heading"), `${tag} ${id} name`).toBeVisible();
        await expect(card.getByTestId("cta"), `${tag} ${id} cta`).toBeVisible();
      }
      return;
    }
    default:
      throw new Error(`${tag}: unknown e2e/pixel assert "${exp.assert}"`);
  }
}

async function runStep(page: Page, step: Step, c: CaseFile): Promise<void> {
  switch (step.op) {
    case "openFresh":
      await openFresh(page);
      return;
    case "click":
      await loc(page, String(step.testId)).click();
      return;
    case "waitVisible":
      await expect(loc(page, String(step.testId))).toBeVisible();
      return;
    case "openMenu":
      await openMenu(page);
      return;
    case "expect":
      await applyExpect(page, step as unknown as Expectation, c.id);
      return;
    default:
      throw new Error(`${c.id}: unknown e2e op "${step.op}"`);
  }
}

export async function runE2ECase(page: Page, c: CaseFile): Promise<void> {
  for (const step of c.steps) await runStep(page, step, c);
  for (const exp of c.expect) await applyExpect(page, exp, c.id);
}
