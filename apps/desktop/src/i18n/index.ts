import { enTranslations } from "./en.ts";
import { ptTranslations } from "./pt.ts";

export type InterfaceLanguage = "en" | "pt";

type TranslationCatalog = Record<string, string>;
type DynamicRule = [RegExp, string];

export const LANGUAGE_STORAGE_KEY = "discasa.ui.language";

export const supportedLanguages: Array<{ value: InterfaceLanguage; label: string }> = [
  { value: "en", label: "English" },
  { value: "pt", label: "Portuguese" },
];

const translationCatalogs: Record<InterfaceLanguage, TranslationCatalog> = {
  en: enTranslations,
  pt: ptTranslations,
};

const reversePortugueseTranslations = Object.fromEntries(
  Object.entries(ptTranslations).map(([english, portuguese]) => [portuguese, english]),
) as TranslationCatalog;

const reverseTranslationCatalogs: Record<InterfaceLanguage, TranslationCatalog> = {
  en: reversePortugueseTranslations,
  pt: {},
};

const dynamicRules: Record<InterfaceLanguage, DynamicRule[]> = {
  en: [
    [/^Conectado como (.+)$/u, "Connected as $1"],
    [/^Servidor aplicado atual: (.+)$/u, "Current applied server: $1"],
    [/^(\d+) selecionado(?:s)?$/u, "$1 selected"],
    [/^(\d+) arquivo\(s\)$/u, "$1 file(s)"],
    [/^(\d+) arquivos, (.+)$/u, "$1 files, $2"],
    [/^1 link(?:s)? de arquivo não pôde ser restaurado do Discord e pode aparecer indisponível\.$/u, "1 file link could not be restored from Discord and may appear unavailable."],
    [/^(\d+) link(?:s)? de arquivo não puderam ser restaurados do Discord e podem aparecer indisponíveis\.$/u, "$1 file links could not be restored from Discord and may appear unavailable."],
    [/^Volume: (.+)$/u, "Volume: $1"],
    [/^(.+)% \| Roda: Zoom$/u, "$1% | Wheel: Zoom"],
    [/^(.+)% \| Roda: Navegar$/u, "$1% | Wheel: Navigate"],
    [/^Duração do vídeo (.+)$/u, "Video duration $1"],
    [/^Álbum criado: (.+)$/u, "Album created: $1"],
    [/^Pasta criada: (.+)$/u, "Folder created: $1"],
    [/^Álbum renomeado para: (.+)$/u, "Album renamed to: $1"],
    [/^Álbum excluído: (.+)$/u, "Album deleted: $1"],
    [/^Álbum movido para cima\.$/u, "Album moved up."],
    [/^Álbum movido para baixo\.$/u, "Album moved down."],
    [/^(\d+) arquivo\(s\) adicionado\(s\) a (.+)\.$/u, "$1 file(s) added to $2."],
    [/^(\d+) arquivo\(s\) movido\(s\) para (.+)\.$/u, "$1 file(s) moved to $2."],
    [/^(\d+) arquivo\(s\) removido\(s\) de (.+)\.$/u, "$1 file(s) removed from $2."],
    [/^(\d+) arquivo\(s\) enviado\(s\) para downloads\.$/u, "$1 file(s) sent to downloads."],
    [/^(\d+) arquivo\(s\) externo\(s\) importado\(s\)\.$/u, "$1 external file(s) imported."],
    [/^(\d+) pasta\(s\) na fila\.$/u, "$1 folder(s) queued."],
    [/^(\d+) arquivo\(s\) adicionado\(s\) por upload de pasta\.$/u, "$1 file(s) added from folder upload."],
    [/^Discasa aplicado a (.+)\.$/u, "Discasa applied to $1."],
    [/^Discasa detectado em (.+)\.$/u, "Discasa detected in $1."],
    [/^(\d+) link\(s\) de arquivo atualizado\(s\)\.$/u, "$1 file link(s) refreshed."],
  ],
  pt: [
    [/^Connected as (.+)$/u, "Conectado como $1"],
    [/^Current applied server: (.+)$/u, "Servidor aplicado atual: $1"],
    [/^(\d+) selected$/u, "$1 selecionado(s)"],
    [/^(\d+) file\(s\)$/u, "$1 arquivo(s)"],
    [/^(\d+) pending$/u, "$1 pendente(s)"],
    [/^(\d+) files, (.+)$/u, "$1 arquivos, $2"],
    [/^1 file link could not be restored from Discord and may appear unavailable\.$/u, "1 link de arquivo não pôde ser restaurado do Discord e pode aparecer indisponível."],
    [/^(\d+) file links could not be restored from Discord and may appear unavailable\.$/u, "$1 links de arquivo não puderam ser restaurados do Discord e podem aparecer indisponíveis."],
    [/^Volume: (.+)$/u, "Volume: $1"],
    [/^(.+)% \| Wheel: Zoom$/u, "$1% | Roda: Zoom"],
    [/^(.+)% \| Wheel: Navigate$/u, "$1% | Roda: Navegar"],
    [/^Video duration (.+)$/u, "Duração do vídeo $1"],
    [/^Album created: (.+)$/u, "Álbum criado: $1"],
    [/^Folder created: (.+)$/u, "Pasta criada: $1"],
    [/^Album renamed to: (.+)$/u, "Álbum renomeado para: $1"],
    [/^Album deleted: (.+)$/u, "Álbum excluído: $1"],
    [/^Album moved up\.$/u, "Álbum movido para cima."],
    [/^Album moved down\.$/u, "Álbum movido para baixo."],
    [/^(\d+) file\(s\) added to (.+)\.$/u, "$1 arquivo(s) adicionado(s) a $2."],
    [/^(\d+) file\(s\) moved to (.+)\.$/u, "$1 arquivo(s) movido(s) para $2."],
    [/^(\d+) file\(s\) removed from (.+)\.$/u, "$1 arquivo(s) removido(s) de $2."],
    [/^(\d+) file\(s\) sent to downloads\.$/u, "$1 arquivo(s) enviado(s) para downloads."],
    [/^(\d+) external file\(s\) imported\.$/u, "$1 arquivo(s) externo(s) importado(s)."],
    [/^(\d+) folder\(s\) queued\.$/u, "$1 pasta(s) na fila."],
    [/^(\d+) file\(s\) added from folder upload\.$/u, "$1 arquivo(s) adicionado(s) por upload de pasta."],
    [/^Discasa applied to (.+)\.$/u, "Discasa aplicado a $1."],
    [/^Discasa detected in (.+)\.$/u, "Discasa detectado em $1."],
    [/^(\d+) file link\(s\) refreshed\.$/u, "$1 link(s) de arquivo atualizado(s)."],
  ],
};

const TRANSLATABLE_ATTRIBUTES = ["aria-label", "placeholder", "title", "alt"] as const;
let activeObserver: MutationObserver | null = null;
let isTranslating = false;
let isTranslationFrameScheduled = false;

export function normalizeLanguage(value: unknown): InterfaceLanguage {
  return value === "pt" ? "pt" : "en";
}

export function readStoredLanguage(fallback: InterfaceLanguage = "en"): InterfaceLanguage {
  if (typeof window === "undefined") {
    return fallback;
  }

  return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY) ?? fallback);
}

export function writeStoredLanguage(language: InterfaceLanguage): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
}

function preserveWhitespace(original: string, translated: string): string {
  const prefix = original.match(/^\s*/u)?.[0] ?? "";
  const suffix = original.match(/\s*$/u)?.[0] ?? "";
  return `${prefix}${translated}${suffix}`;
}

function translateDynamicText(value: string, language: InterfaceLanguage): string | null {
  for (const [pattern, replacement] of dynamicRules[language]) {
    if (pattern.test(value)) {
      return value.replace(pattern, replacement);
    }
  }

  return null;
}

function translateTextValue(value: string, language: InterfaceLanguage): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }

  const direct = translationCatalogs[language][trimmed] ?? reverseTranslationCatalogs[language][trimmed];
  const translated = direct ?? translateDynamicText(trimmed, language);

  return translated ? preserveWhitespace(value, translated) : value;
}

function shouldSkipNode(node: Node): boolean {
  const parent = node.parentElement;
  if (!parent) {
    return true;
  }

  return Boolean(parent.closest("script, style, textarea, code, pre, [data-i18n-ignore='true']"));
}

function translateTextNodes(root: ParentNode, language: InterfaceLanguage): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (shouldSkipNode(node) || !node.nodeValue?.trim()) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Text[] = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text);
  }

  for (const node of nodes) {
    const currentValue = node.nodeValue ?? "";
    const translated = translateTextValue(currentValue, language);
    if (translated !== currentValue) {
      node.nodeValue = translated;
    }
  }
}

function translateAttributes(root: ParentNode, language: InterfaceLanguage): void {
  if (!(root instanceof Element || root instanceof Document)) {
    return;
  }

  const candidates = root instanceof Element ? [root, ...Array.from(root.querySelectorAll("*"))] : Array.from(root.querySelectorAll("*"));

  for (const element of candidates) {
    if (element.closest("[data-i18n-ignore='true']")) {
      continue;
    }

    for (const attribute of TRANSLATABLE_ATTRIBUTES) {
      const currentValue = element.getAttribute(attribute);
      if (!currentValue) {
        continue;
      }

      const translated = translateTextValue(currentValue, language);
      if (translated !== currentValue) {
        element.setAttribute(attribute, translated);
      }
    }
  }
}

function translateTree(root: ParentNode, language: InterfaceLanguage): void {
  if (typeof document === "undefined") {
    return;
  }

  isTranslating = true;
  try {
    document.documentElement.lang = language === "pt" ? "pt-BR" : "en";
    translateTextNodes(root, language);
    translateAttributes(root, language);
  } finally {
    isTranslating = false;
  }
}

export function applyInterfaceLanguage(language: InterfaceLanguage, root: HTMLElement = document.body): () => void {
  activeObserver?.disconnect();
  translateTree(root, language);

  activeObserver = new MutationObserver(() => {
    if (isTranslating || isTranslationFrameScheduled) {
      return;
    }

    isTranslationFrameScheduled = true;
    window.requestAnimationFrame(() => {
      isTranslationFrameScheduled = false;
      translateTree(root, language);
    });
  });

  activeObserver.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
  });

  return () => {
    activeObserver?.disconnect();
    activeObserver = null;
  };
}
