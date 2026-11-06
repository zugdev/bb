import type * as MonacoNs from "monaco-editor";
import { languageForPath } from "./languages.js";

export interface DefinitionTarget {
  absolutePath: string;
  relativePath: string | null;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface NavigationBinding {
  definitions(
    content: string,
    position: MonacoNs.IPosition,
  ): Promise<readonly DefinitionTarget[]>;
  hover(content: string, position: MonacoNs.IPosition): Promise<readonly string[]>;
  readFile(absolutePath: string): Promise<string | null>;
  open(absolutePath: string, selection: MonacoNs.IRange | null): void;
}

export const NAVIGABLE_LANGUAGES = ["typescript", "javascript"];

const MAX_PREVIEW_MODELS = 20;

const byModel = new Map<string, NavigationBinding>();
const byEditor = new WeakMap<MonacoNs.editor.ICodeEditor, NavigationBinding>();
const previewModels: string[] = [];
let copyCounter = 0;

export function bindEditor(
  editor: MonacoNs.editor.ICodeEditor,
  model: MonacoNs.editor.ITextModel,
  binding: NavigationBinding,
): () => void {
  const key = model.uri.toString();
  byModel.set(key, binding);
  byEditor.set(editor, binding);
  return () => {
    if (byModel.get(key) === binding) byModel.delete(key);
    byEditor.delete(editor);
  };
}

export function createFileModel(
  monaco: typeof MonacoNs,
  absolutePath: string,
  content: string,
): MonacoNs.editor.ITextModel {
  const uri = monaco.Uri.file(absolutePath);
  const index = previewModels.indexOf(uri.toString());
  if (index >= 0) previewModels.splice(index, 1);
  const existing = monaco.editor.getModel(uri);
  if (existing !== null && !byModel.has(uri.toString())) {
    existing.setValue(content);
    return existing;
  }
  const modelUri =
    existing === null ? uri : uri.with({ query: `copy=${++copyCounter}` });
  return monaco.editor.createModel(
    content,
    languageForPath(absolutePath),
    modelUri,
  );
}

async function ensurePreviewModel(
  monaco: typeof MonacoNs,
  binding: NavigationBinding,
  absolutePath: string,
) {
  const uri = monaco.Uri.file(absolutePath);
  if (monaco.editor.getModel(uri) !== null) return;
  const content = await binding.readFile(absolutePath).catch(() => null);
  if (content === null || monaco.editor.getModel(uri) !== null) return;
  monaco.editor.createModel(content, languageForPath(absolutePath), uri);
  previewModels.push(uri.toString());
  while (previewModels.length > MAX_PREVIEW_MODELS) {
    const oldest = previewModels.shift();
    if (oldest === undefined || byModel.has(oldest)) continue;
    monaco.editor.getModel(monaco.Uri.parse(oldest))?.dispose();
  }
}

function toRange(
  selectionOrPosition: MonacoNs.IRange | MonacoNs.IPosition | undefined,
): MonacoNs.IRange | null {
  if (selectionOrPosition === undefined) return null;
  if ("startLineNumber" in selectionOrPosition) return selectionOrPosition;
  return {
    startLineNumber: selectionOrPosition.lineNumber,
    startColumn: selectionOrPosition.column,
    endLineNumber: selectionOrPosition.lineNumber,
    endColumn: selectionOrPosition.column,
  };
}

export function registerNavigation(monaco: typeof MonacoNs): void {
  monaco.typescript.typescriptDefaults.setModeConfiguration({});
  monaco.typescript.javascriptDefaults.setModeConfiguration({});

  monaco.languages.registerDefinitionProvider(NAVIGABLE_LANGUAGES, {
    async provideDefinition(model, position) {
      const binding = byModel.get(model.uri.toString());
      if (binding === undefined) return null;
      const targets = await binding
        .definitions(model.getValue(), position)
        .catch(() => []);
      await Promise.all(
        targets.map((target) =>
          ensurePreviewModel(monaco, binding, target.absolutePath),
        ),
      );
      return targets.map((target) => ({
        uri: monaco.Uri.file(target.absolutePath),
        range: new monaco.Range(
          target.startLine,
          target.startColumn,
          target.endLine,
          target.endColumn,
        ),
      }));
    },
  });

  monaco.languages.registerHoverProvider(NAVIGABLE_LANGUAGES, {
    async provideHover(model, position) {
      const binding = byModel.get(model.uri.toString());
      if (binding === undefined) return null;
      const contents = await binding
        .hover(model.getValue(), position)
        .catch(() => []);
      if (contents.length === 0) return null;
      return { contents: contents.map((value) => ({ value })) };
    },
  });

  monaco.editor.registerEditorOpener({
    openCodeEditor(source, resource, selectionOrPosition) {
      const binding = byEditor.get(source);
      if (binding === undefined || resource.scheme !== "file") return false;
      binding.open(resource.fsPath, toRange(selectionOrPosition));
      return true;
    },
  });
}
