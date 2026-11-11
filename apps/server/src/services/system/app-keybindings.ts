import {
  type AppCommandContextKey,
  type AppCommandId,
  type AppDefaultKeybinding,
  type AppDefaultKeybindings,
  type AppKeybinding,
  type AppKeybindings,
  type AppShortcut,
  QUESTION_SELECT_APP_COMMAND_IDS,
  PANE_FOCUS_APP_COMMAND_IDS,
  SPLIT_TAB_SELECT_APP_COMMAND_IDS,
  THREAD_JUMP_APP_COMMAND_IDS,
} from "@bb/domain";

interface ShortcutModifiers {
  mod?: boolean;
  meta?: boolean;
  control?: boolean;
  alt?: boolean;
  shift?: boolean;
}

interface BindingOptions {
  all?: readonly AppCommandContextKey[];
  desktopOnly?: boolean;
  none?: readonly AppCommandContextKey[];
}

function shortcut(key: string, modifiers: ShortcutModifiers = {}): AppShortcut {
  return {
    key,
    mod: modifiers.mod ?? false,
    meta: modifiers.meta ?? false,
    control: modifiers.control ?? false,
    alt: modifiers.alt ?? false,
    shift: modifiers.shift ?? false,
  };
}

function binding(
  command: AppCommandId,
  key: string,
  modifiers: ShortcutModifiers,
  options: BindingOptions = {},
): AppKeybinding {
  return {
    command,
    desktopOnly: options.desktopOnly ?? false,
    shortcut: shortcut(key, modifiers),
    when: {
      all: [...(options.all ?? [])],
      none: [...(options.none ?? [])],
    },
  };
}

function unassignedBinding(
  command: AppCommandId,
  options: BindingOptions = {},
): AppDefaultKeybinding {
  return {
    command,
    desktopOnly: options.desktopOnly ?? false,
    shortcut: null,
    when: {
      all: [...(options.all ?? [])],
      none: [...(options.none ?? [])],
    },
  };
}

function macArrowBindings(
  command: AppCommandId,
  key: string,
  modifiers: ShortcutModifiers,
  options: BindingOptions,
): AppDefaultKeybindings {
  return [
    binding(command, key, modifiers, {
      ...options,
      all: [...(options.all ?? []), "macPlatform"],
    }),
    unassignedBinding(command, {
      ...options,
      none: [...(options.none ?? []), "macPlatform"],
    }),
  ];
}

function numberedChatBindings(
  commands: readonly AppCommandId[],
  options: BindingOptions,
): AppKeybindings {
  return commands.flatMap((command, index) => [
    binding(
      command,
      String(index + 1),
      { control: true },
      {
        ...options,
        all: [...(options.all ?? []), "macPlatform"],
      },
    ),
    binding(
      command,
      String(index + 1),
      { mod: true, shift: true },
      {
        ...options,
        none: [...(options.none ?? []), "macPlatform"],
      },
    ),
  ]);
}

function webAndDesktopBindings(
  command: AppCommandId,
  key: string,
  web: ShortcutModifiers,
  desktop: ShortcutModifiers,
  options: BindingOptions,
): AppKeybindings {
  return [
    binding(command, key, web, {
      ...options,
      all: [...(options.all ?? []), "webSurface"],
    }),
    binding(command, key, desktop, { ...options, desktopOnly: true }),
  ];
}

const mainWithoutModal = {
  all: ["mainSurface"],
  none: ["modalOpen"],
} as const;

const composerWithoutModal = {
  all: ["mainSurface", "promptAvailable"],
  none: ["modalOpen", "terminalFocus", "browserFocus"],
} as const;

const terminalWithoutModal = {
  all: ["mainSurface", "terminalFocus"],
  none: ["modalOpen"],
} as const;

const pickerOpenOnly = {
  all: ["mainSurface", "modelPickerOpen"],
  none: [],
} as const;

const webMainWithoutModal = {
  all: ["mainSurface", "webSurface"],
  none: ["modalOpen"],
} as const;

const mainWithoutModalOrBrowser = {
  all: ["mainSurface"],
  none: ["modalOpen", "browserFocus"],
} as const;

const mainWithoutEditable = {
  all: ["mainSurface"],
  none: ["modalOpen", "editableFocus", "terminalFocus", "browserFocus"],
} as const;

const mainWithoutTerminalOrBrowser = {
  all: ["mainSurface"],
  none: ["modalOpen", "terminalFocus", "browserFocus"],
} as const;

const questionWithoutOtherEditable: readonly BindingOptions[] = [
  {
    all: ["mainSurface", "questionOpen"],
    none: ["modalOpen", "editableFocus"],
  },
  { all: ["mainSurface", "questionFocus"], none: ["modalOpen"] },
];

const questionFocusWithoutEditable = {
  all: ["mainSurface", "questionFocus"],
  none: ["modalOpen", "editableFocus"],
} as const;

const splitWithoutModal = {
  all: ["mainSurface", "splitActive"],
  none: ["modalOpen"],
} as const;

export const DEFAULT_APP_KEYBINDINGS: AppDefaultKeybindings = [
  unassignedBinding("history.back", mainWithoutModalOrBrowser),
  unassignedBinding("history.forward", mainWithoutModalOrBrowser),
  binding("palette.open", "p", { mod: true, shift: true }, mainWithoutModal),
  binding("thread.new", "o", { mod: true, shift: true }, mainWithoutModal),
  binding(
    "thread.new",
    "n",
    { mod: true },
    {
      ...mainWithoutModal,
      desktopOnly: true,
    },
  ),
  binding("thread.search", "k", { mod: true }, mainWithoutModal),
  unassignedBinding("thread.rename", mainWithoutModal),
  binding("thread.archive", "a", { mod: true }, mainWithoutEditable),
  binding("thread.snooze", "s", { mod: true }, mainWithoutModal),
  binding("thread.undo", "z", { mod: true }, mainWithoutTerminalOrBrowser),
  unassignedBinding("thread.markRead", mainWithoutModal),
  unassignedBinding("thread.pin", mainWithoutModal),
  binding("app.back", "Escape", {}, mainWithoutModal),
  binding("settings.open", ",", { mod: true }, mainWithoutModal),
  binding("sidebar.toggle", "[", { mod: true }, mainWithoutModal),
  unassignedBinding("notifications.open", mainWithoutModal),
  unassignedBinding("plugins.enterSafeMode", mainWithoutModal),
  unassignedBinding("plugins.exitSafeMode", mainWithoutModal),
  unassignedBinding("plugins.pruneCache", mainWithoutModal),
  binding(
    "thread.previous",
    "[",
    { control: true, shift: true },
    webMainWithoutModal,
  ),
  binding(
    "thread.previous",
    "[",
    { mod: true, shift: true },
    {
      ...mainWithoutModal,
      desktopOnly: true,
    },
  ),
  binding(
    "thread.next",
    "]",
    { control: true, shift: true },
    webMainWithoutModal,
  ),
  binding(
    "thread.next",
    "]",
    { mod: true, shift: true },
    {
      ...mainWithoutModal,
      desktopOnly: true,
    },
  ),
  ...numberedChatBindings(THREAD_JUMP_APP_COMMAND_IDS, mainWithoutModal),
  ...(
    [
      ["pane.focus.left", "ArrowLeft"],
      ["pane.focus.right", "ArrowRight"],
      ["pane.focus.up", "ArrowUp"],
      ["pane.focus.down", "ArrowDown"],
    ] as const
  ).flatMap(([command, key]) =>
    macArrowBindings(
      command,
      key,
      { mod: true, control: true, shift: true },
      splitWithoutModal,
    ),
  ),
  unassignedBinding("pane.focus.previous", splitWithoutModal),
  unassignedBinding("pane.focus.next", splitWithoutModal),
  ...numberedChatBindings(PANE_FOCUS_APP_COMMAND_IDS, splitWithoutModal),
  ...webAndDesktopBindings(
    "pane.split.right",
    "d",
    { alt: true },
    { mod: true },
    mainWithoutModalOrBrowser,
  ),
  ...webAndDesktopBindings(
    "pane.split.down",
    "d",
    { alt: true, shift: true },
    { mod: true, shift: true },
    mainWithoutModalOrBrowser,
  ),
  binding(
    "pane.maximize.toggle",
    "e",
    { mod: true, shift: true },
    splitWithoutModal,
  ),
  ...webAndDesktopBindings(
    "pane.close",
    "w",
    { alt: true },
    { mod: true },
    mainWithoutModalOrBrowser,
  ),
  ...webAndDesktopBindings(
    "splitTab.new",
    "t",
    { alt: true },
    { mod: true },
    mainWithoutModalOrBrowser,
  ),
  ...webAndDesktopBindings(
    "splitTab.reopenClosed",
    "t",
    { alt: true, shift: true },
    { mod: true, shift: true },
    mainWithoutModalOrBrowser,
  ),
  binding("splitTab.newForProject", "o", { mod: true }, mainWithoutModal),
  ...SPLIT_TAB_SELECT_APP_COMMAND_IDS.flatMap((command, index) =>
    webAndDesktopBindings(
      command,
      String(index + 1),
      { alt: true },
      { mod: true },
      mainWithoutModalOrBrowser,
    ),
  ),
  ...macArrowBindings(
    "panel.previousTab",
    "ArrowLeft",
    { mod: true, control: true },
    mainWithoutModal,
  ),
  ...macArrowBindings(
    "panel.nextTab",
    "ArrowRight",
    { mod: true, control: true },
    mainWithoutModal,
  ),
  ...macArrowBindings(
    "panel.previousNewTabItem",
    "ArrowUp",
    { mod: true, control: true },
    mainWithoutModal,
  ),
  ...macArrowBindings(
    "panel.nextNewTabItem",
    "ArrowDown",
    { mod: true, control: true },
    mainWithoutModal,
  ),
  ...webAndDesktopBindings(
    "panel.newTab",
    "t",
    { mod: true },
    { mod: true, alt: true },
    mainWithoutModal,
  ),
  binding(
    "panel.reopenClosedTab",
    "t",
    { mod: true, alt: true, shift: true },
    {
      ...mainWithoutModal,
      desktopOnly: true,
    },
  ),
  ...webAndDesktopBindings(
    "panel.close",
    "w",
    { mod: true },
    { mod: true, alt: true },
    mainWithoutModal,
  ),
  binding("panel.toggle", "e", { mod: true }, mainWithoutModal),
  binding("panel.toggleNewTab", "]", { mod: true }, mainWithoutModal),
  unassignedBinding("panel.fullScreen.toggle", mainWithoutModal),
  binding("file.quickOpen", "p", { mod: true }, mainWithoutModal),
  binding(
    "terminal.open",
    "Enter",
    { mod: true, shift: true },
    mainWithoutModal,
  ),
  binding(
    "terminal.find",
    "f",
    { mod: true },
    {
      ...terminalWithoutModal,
      all: [...terminalWithoutModal.all, "macPlatform"],
    },
  ),
  binding(
    "terminal.find",
    "f",
    { mod: true, shift: true },
    {
      ...terminalWithoutModal,
      none: [...terminalWithoutModal.none, "macPlatform"],
    },
  ),
  binding(
    "composer.focus",
    "c",
    { mod: true, shift: true },
    composerWithoutModal,
  ),
  binding(
    "modelPicker.toggle",
    "m",
    { mod: true, shift: true },
    composerWithoutModal,
  ),
  binding(
    "modelPicker.toggle",
    "m",
    { mod: true, shift: true },
    pickerOpenOnly,
  ),
  binding("modelPicker.cycleModel", "m", { alt: true }, composerWithoutModal),
  binding(
    "modelPicker.cycleModelBackward",
    "m",
    { alt: true, shift: true },
    composerWithoutModal,
  ),
  binding(
    "modelPicker.cycleProvider",
    "p",
    { alt: true },
    composerWithoutModal,
  ),
  binding(
    "modelPicker.cycleProviderBackward",
    "p",
    { alt: true, shift: true },
    composerWithoutModal,
  ),
  binding(
    "modelPicker.cycleReasoning",
    "r",
    { alt: true },
    composerWithoutModal,
  ),
  binding(
    "modelPicker.cycleReasoningBackward",
    "r",
    { alt: true, shift: true },
    composerWithoutModal,
  ),
  binding("modelPicker.cycleModel", "m", { alt: true }, pickerOpenOnly),
  binding(
    "modelPicker.cycleModelBackward",
    "m",
    { alt: true, shift: true },
    pickerOpenOnly,
  ),
  binding("modelPicker.cycleProvider", "p", { alt: true }, pickerOpenOnly),
  binding(
    "modelPicker.cycleProviderBackward",
    "p",
    { alt: true, shift: true },
    pickerOpenOnly,
  ),
  binding("modelPicker.cycleReasoning", "r", { alt: true }, pickerOpenOnly),
  binding(
    "modelPicker.cycleReasoningBackward",
    "r",
    { alt: true, shift: true },
    pickerOpenOnly,
  ),
  binding(
    "browser.focusLocation",
    "l",
    { mod: true },
    {
      all: ["mainSurface", "browserFocus"],
      desktopOnly: true,
      none: ["modalOpen"],
    },
  ),
  binding(
    "browser.reload",
    "r",
    { mod: true },
    {
      all: ["mainSurface", "browserFocus"],
      desktopOnly: true,
      none: ["modalOpen"],
    },
  ),
  binding(
    "browser.find",
    "f",
    { mod: true },
    {
      all: ["mainSurface", "browserFocus"],
      desktopOnly: true,
      none: ["modalOpen", "terminalFocus"],
    },
  ),
  binding(
    "window.find",
    "f",
    { mod: true },
    {
      all: ["mainSurface"],
      desktopOnly: true,
      none: ["modalOpen", "browserFocus", "terminalFocus"],
    },
  ),
  binding(
    "workspace.openPreferred",
    "o",
    { mod: true, alt: true },
    mainWithoutModal,
  ),
  ...QUESTION_SELECT_APP_COMMAND_IDS.map((command, index) =>
    binding(
      command,
      String(index + 1),
      {},
      {
        all: ["mainSurface", "questionOpen"],
        none: ["modalOpen", "editableFocus"],
      },
    ),
  ),
  ...questionWithoutOtherEditable.map((options) =>
    binding("question.submit", "Enter", { mod: true }, options),
  ),
  ...questionWithoutOtherEditable.map((options) =>
    binding("question.cancel", ".", { mod: true }, options),
  ),
  binding("question.previous", "ArrowLeft", {}, questionFocusWithoutEditable),
  binding("question.next", "ArrowRight", {}, questionFocusWithoutEditable),
  binding(
    "window.new",
    "n",
    { mod: true, shift: true },
    {
      ...mainWithoutModal,
      desktopOnly: true,
    },
  ),
  unassignedBinding("logs.openServerDaemon", {
    all: ["mainSurface"],
    desktopOnly: true,
    none: ["modalOpen"],
  }),
  unassignedBinding("window.reload", {
    all: ["mainSurface"],
    desktopOnly: true,
    none: ["modalOpen"],
  }),
  unassignedBinding("dataDirectory.open", {
    all: ["mainSurface"],
    desktopOnly: true,
    none: ["modalOpen"],
  }),
];
