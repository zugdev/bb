// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  COMPOSER_MENU_OPEN_ATTRIBUTE,
  isComposerTabTarget,
} from "./composer-command-ownership";

function composerEditor(menuOpen: boolean): HTMLElement {
  const composer = document.createElement("div");
  composer.setAttribute("data-app-composer", "");
  const form = document.createElement("form");
  form.toggleAttribute(COMPOSER_MENU_OPEN_ATTRIBUTE, menuOpen);
  const editor = document.createElement("div");
  form.append(editor);
  composer.append(form);
  return editor;
}

describe("isComposerTabTarget", () => {
  it("lets Tab leave a composer only while its suggestion menu is closed", () => {
    expect(isComposerTabTarget(composerEditor(false))).toBe(true);
    expect(isComposerTabTarget(composerEditor(true))).toBe(false);
    expect(isComposerTabTarget(document.createElement("input"))).toBe(false);
  });
});
