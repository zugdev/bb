export const APP_COMPOSER_SELECTOR = "[data-app-composer]";
export const COMPOSER_MENU_OPEN_ATTRIBUTE = "data-composer-menu-open";

export function isComposerTabTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(APP_COMPOSER_SELECTOR) !== null &&
    target.closest(`[${COMPOSER_MENU_OPEN_ATTRIBUTE}]`) === null
  );
}

export interface ComposerCommandScope {
  isFocusedPane: boolean;
  isPrimaryComposer: boolean;
  caretInThisComposer: boolean;
  caretInOtherComposer: boolean;
}

export function composerOwnsCommand(scope: ComposerCommandScope): boolean {
  if (!scope.isFocusedPane) return false;
  if (scope.caretInThisComposer) return true;
  if (scope.caretInOtherComposer) return false;
  return scope.isPrimaryComposer;
}

export function resolveComposerCommandScope({
  composer,
  target,
  isFocusedPane,
}: {
  composer: Element | null;
  target: EventTarget | null;
  isFocusedPane: boolean;
}): ComposerCommandScope {
  const caretComposer =
    target instanceof Element ? target.closest(APP_COMPOSER_SELECTOR) : null;
  return {
    isFocusedPane,
    isPrimaryComposer:
      composer !== null &&
      composer.getAttribute("data-app-composer-role") !== "secondary",
    caretInThisComposer: caretComposer !== null && caretComposer === composer,
    caretInOtherComposer: caretComposer !== null && caretComposer !== composer,
  };
}
