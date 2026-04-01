import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import type { CollectionRecord, LibraryItem } from "@discasa/shared";
import { createCollection, deleteCollection, getCollections, getLibraryItems, getSession, openDiscordLogin, reorderCollectionOrder, uploadFiles } from "./lib/api";
import { getCurrentWindow } from "@tauri-apps/api/window";
import logoUrl from "./assets/discasa-logo.png";

type Page = "library" | "settings";
type WindowState = "default" | "maximized";

type SidebarEntry = {
  id: string;
  name: string;
  itemCount: number;
  isSystem: boolean;
};

type ContextMenuState = {
  x: number;
  y: number;
  collectionId: string;
  collectionName: string;
} | null;

const appWindow = getCurrentWindow();
const SIDEBAR_COLLAPSED_KEY = "discasa.sidebar.collapsed";
const MINIMIZE_TO_TRAY_KEY = "discasa.window.minimizeToTray";
const CLOSE_TO_TRAY_KEY = "discasa.window.closeToTray";

function readStoredBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === "1";
}

function moveCollection(list: CollectionRecord[], draggedId: string, targetId: string): CollectionRecord[] {
  if (draggedId === targetId) return list;

  const fromIndex = list.findIndex((collection) => collection.id === draggedId);
  const toIndex = list.findIndex((collection) => collection.id === targetId);

  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return list;
  }

  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function FolderIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`folder-icon ${filled ? "filled" : ""}`}>
      <path d="M3.75 6.75A2.25 2.25 0 0 1 6 4.5h3.07c.6 0 1.16.24 1.58.66l1.02 1.02c.14.14.34.22.54.22H18A2.25 2.25 0 0 1 20.25 8.7v8.55A2.25 2.25 0 0 1 18 19.5H6a2.25 2.25 0 0 1-2.25-2.25V6.75Z" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronLeftDoubleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m13.5 6-6 6 6 6M19 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightDoubleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m10.5 6 6 6-6 6M5 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5.5v13M5.5 12h13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.14 12.94a7.43 7.43 0 0 0 .05-.94 7.43 7.43 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.6 7.6 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.49-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54c-.58.22-1.12.53-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.43 7.43 0 0 0-.05.94c0 .32.02.63.05.94L2.83 14.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.41 1.05.72 1.63.94l.36 2.54a.5.5 0 0 0 .49.42h3.84a.5.5 0 0 0 .49-.42l.36-2.54c.58-.22 1.12-.53 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z" fill="currentColor" />
    </svg>
  );
}

export function App() {
  const [page, setPage] = useState<Page>("library");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("all");
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isBusy, setIsBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [windowState, setWindowState] = useState<WindowState>("default");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => readStoredBoolean(SIDEBAR_COLLAPSED_KEY, false));
  const [draggedCollectionId, setDraggedCollectionId] = useState<string | null>(null);
  const [dragOverCollectionId, setDragOverCollectionId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [minimizeToTray, setMinimizeToTray] = useState<boolean>(() => readStoredBoolean(MINIMIZE_TO_TRAY_KEY, false));
  const [closeToTray, setCloseToTray] = useState<boolean>(() => readStoredBoolean(CLOSE_TO_TRAY_KEY, false));

  const dragDepthRef = useRef(0);
  const collectionsRef = useRef<CollectionRecord[]>([]);
  const reorderDirtyRef = useRef(false);
  const closeToTrayRef = useRef(closeToTray);

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    collectionsRef.current = collections;
  }, [collections]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, isSidebarCollapsed ? "1" : "0");
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(MINIMIZE_TO_TRAY_KEY, minimizeToTray ? "1" : "0");
  }, [minimizeToTray]);

  useEffect(() => {
    closeToTrayRef.current = closeToTray;
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CLOSE_TO_TRAY_KEY, closeToTray ? "1" : "0");
  }, [closeToTray]);

  useEffect(() => {
    if (!message && !error) return;

    const timer = window.setTimeout(() => {
      setMessage("");
      setError("");
    }, 2600);

    return () => window.clearTimeout(timer);
  }, [message, error]);

  useEffect(() => {
    if (!contextMenu) return;

    const handlePointerDown = () => setContextMenu(null);
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenu]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void appWindow.onCloseRequested(async (event) => {
      if (!closeToTrayRef.current) return;

      event.preventDefault();

      try {
        await appWindow.hide();
        setMessage("Discasa enviado para a bandeja.");
        setError("");
      } catch {
        setError("Não foi possível enviar o app para a bandeja.");
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  async function bootstrap(): Promise<void> {
    setIsBusy(true);
    setError("");

    try {
      const [session, nextCollections, nextItems] = await Promise.all([
        getSession(),
        getCollections(),
        getLibraryItems(),
      ]);

      setIsAuthenticated(session.authenticated);
      setCollections(nextCollections);
      setItems(nextItems);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load Discasa preview.");
    } finally {
      setIsBusy(false);
    }
  }

  const sidebarEntries = useMemo<SidebarEntry[]>(() => {
    return [
      { id: "all", name: "All Files", itemCount: items.length, isSystem: true },
      ...collections.map((collection) => ({
        id: collection.id,
        name: collection.name,
        itemCount: countForCollection(collection.id),
        isSystem: false,
      })),
    ];
  }, [collections, items]);

  const visibleItems = useMemo(() => {
    if (selectedCollectionId === "all") return items;
    return items.filter((item) => item.collectionIds.includes(selectedCollectionId));
  }, [items, selectedCollectionId]);

  function countForCollection(collectionId: string): number {
    if (collectionId === "all") return items.length;
    return items.filter((item) => item.collectionIds.includes(collectionId)).length;
  }

  function getCollectionIndex(collectionId: string): number {
    return collectionsRef.current.findIndex((collection) => collection.id === collectionId);
  }

  function canMoveCollection(collectionId: string, direction: "up" | "down"): boolean {
    const index = getCollectionIndex(collectionId);
    if (index === -1) return false;
    if (direction === "up") return index > 0;
    return index < collectionsRef.current.length - 1;
  }

  async function handleMoveCollection(collectionId: string, direction: "up" | "down"): Promise<void> {
    const currentIndex = getCollectionIndex(collectionId);
    if (currentIndex === -1) return;

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= collectionsRef.current.length) return;

    const nextCollections = [...collectionsRef.current];
    const [moved] = nextCollections.splice(currentIndex, 1);
    nextCollections.splice(targetIndex, 0, moved);

    try {
      const orderedIds = nextCollections.map((collection) => collection.id);
      const response = await reorderCollectionOrder(orderedIds);
      collectionsRef.current = response.collections;
      setCollections(response.collections);
      setContextMenu(null);
      setMessage(`Álbum movido para ${direction === "up" ? "cima" : "baixo"}.`);
      setError("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Não foi possível mover o álbum.");
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(1)} GB`;
  }

  async function handleCreateCollection(): Promise<void> {
    const name = window.prompt("Nome do novo álbum:");
    if (!name || !name.trim()) return;

    try {
      const trimmed = name.trim();
      const result = await createCollection({ name: trimmed });
      const nextCollection: CollectionRecord = { id: result.id, name: trimmed, itemCount: 0 };
      const nextCollections = [...collectionsRef.current, nextCollection];
      collectionsRef.current = nextCollections;
      setCollections(nextCollections);
      setSelectedCollectionId(nextCollection.id);
      setPage("library");
      setMessage(`Álbum criado: ${trimmed}`);
      setError("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Não foi possível criar o álbum.");
    }
  }

  async function handleDeleteCollection(collectionId: string, collectionName: string): Promise<void> {
    const confirmed = window.confirm(`Excluir o álbum \"${collectionName}\"?`);
    if (!confirmed) return;

    try {
      await deleteCollection(collectionId);
      const nextCollections = collectionsRef.current.filter((collection) => collection.id !== collectionId);
      collectionsRef.current = nextCollections;
      setCollections(nextCollections);
      setItems((current) => current.map((item) => ({
        ...item,
        collectionIds: item.collectionIds.filter((id) => id !== collectionId),
      })));
      setSelectedCollectionId((current) => (current === collectionId ? "all" : current));
      setContextMenu(null);
      setMessage(`Álbum excluído: ${collectionName}`);
      setError("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Não foi possível excluir o álbum.");
    }
  }

  async function handleFiles(fileList: FileList | null): Promise<void> {
    if (!fileList || fileList.length === 0) return;

    setIsBusy(true);
    setError("");

    try {
      await uploadFiles(Array.from(fileList), selectedCollectionId);
      const [nextItems, nextCollections] = await Promise.all([
        getLibraryItems(),
        getCollections(),
      ]);
      collectionsRef.current = nextCollections;
      setItems(nextItems);
      setCollections(nextCollections);
      setMessage(`${fileList.length} arquivo(s) adicionado(s) à biblioteca.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Falha ao adicionar arquivos.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleStartDragging(event: MouseEvent<HTMLElement>): Promise<void> {
    if (event.button !== 0) return;

    event.preventDefault();

    try {
      await appWindow.startDragging();
    } catch {
      // Browser preview fallback.
    }
  }

  async function handleMinimize(): Promise<void> {
    try {
      if (minimizeToTray) {
        await appWindow.hide();
        setMessage("Discasa enviado para a bandeja.");
        setError("");
        return;
      }

      await appWindow.minimize();
    } catch {
      setError("Não foi possível minimizar o app.");
    }
  }

  async function handleToggleMaximize(): Promise<void> {
    try {
      await appWindow.toggleMaximize();
      const next = await appWindow.isMaximized();
      setWindowState(next ? "maximized" : "default");
    } catch {
      setWindowState((current) => (current === "maximized" ? "default" : "maximized"));
    }
  }

  async function handleClose(): Promise<void> {
    try {
      if (closeToTrayRef.current) {
        await appWindow.hide();
        setMessage("Discasa enviado para a bandeja.");
        setError("");
        return;
      }

      await appWindow.destroy();
    } catch {
      setError("Não foi possível fechar o app.");
    }
  }

  function handleFileDragEnter(event: DragEvent<HTMLElement>): void {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setIsDraggingFiles(true);
  }

  function handleFileDragLeave(event: DragEvent<HTMLElement>): void {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current -= 1;

    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setIsDraggingFiles(false);
    }
  }

  function handleFileDragOver(event: DragEvent<HTMLElement>): void {
    event.preventDefault();
    event.stopPropagation();
    if (!isDraggingFiles) {
      setIsDraggingFiles(true);
    }
  }

  async function handleFileDrop(event: DragEvent<HTMLElement>): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
    await handleFiles(event.dataTransfer.files);
  }

  function handleCollectionDragStart(event: DragEvent<HTMLElement>, collectionId: string): void {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", collectionId);
    setDraggedCollectionId(collectionId);
    setDragOverCollectionId(null);
    setContextMenu(null);
    reorderDirtyRef.current = false;
  }

  function handleCollectionDragOver(event: DragEvent<HTMLElement>, targetCollectionId: string): void {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";

    const draggedId = draggedCollectionId ?? event.dataTransfer.getData("text/plain");
    if (!draggedId || draggedId === targetCollectionId) {
      return;
    }

    const currentOrder = collectionsRef.current.map((collection) => collection.id).join("|");
    const nextCollections = moveCollection(collectionsRef.current, draggedId, targetCollectionId);
    const nextOrder = nextCollections.map((collection) => collection.id).join("|");

    if (currentOrder === nextOrder) {
      return;
    }

    collectionsRef.current = nextCollections;
    reorderDirtyRef.current = true;
    setCollections(nextCollections);
    setDragOverCollectionId(targetCollectionId);
  }

  function handleCollectionDrop(event: DragEvent<HTMLElement>, targetCollectionId: string): void {
    event.preventDefault();
    event.stopPropagation();
    setDragOverCollectionId(targetCollectionId);
  }

  async function persistReorderedCollections(): Promise<void> {
    try {
      const orderedIds = collectionsRef.current.map((collection) => collection.id);
      const response = await reorderCollectionOrder(orderedIds);
      collectionsRef.current = response.collections;
      setCollections(response.collections);
      setMessage("Ordem dos álbuns atualizada.");
      setError("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Não foi possível salvar a nova ordem.");
    }
  }

  function handleCollectionDragEnd(): void {
    const shouldPersist = reorderDirtyRef.current;
    reorderDirtyRef.current = false;
    setDraggedCollectionId(null);
    setDragOverCollectionId(null);

    if (shouldPersist) {
      void persistReorderedCollections();
    }
  }

  function handleCollectionContextMenu(event: MouseEvent<HTMLElement>, collectionId: string, collectionName: string): void {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, collectionId, collectionName });
  }

  return (
    <div className="app-shell">
      <div className={`app-frame ${windowState === "maximized" ? "window-maximized" : ""}`}>
        <header className="titlebar">
          <div className="titlebar-drag-surface" aria-hidden="true" onMouseDown={(event) => { void handleStartDragging(event); }} />

          <div className="brand">
            <img src={logoUrl} alt="Discasa" className="brand-logo" />
            <span className="brand-name">Discasa</span>
          </div>

          <div className="window-controls">
            <button type="button" className="window-button" onClick={() => void handleMinimize()} aria-label="Minimizar">
              <span className="window-glyph minimize" />
            </button>
            <button type="button" className="window-button" onClick={() => void handleToggleMaximize()} aria-label="Maximizar ou restaurar">
              <span className="window-glyph maximize" />
            </button>
            <button type="button" className="window-button close-button" onClick={() => void handleClose()} aria-label="Fechar">
              <span className="window-glyph close" />
            </button>
          </div>
        </header>

        <div className="workspace">
          <aside className={`sidebar-panel ${isSidebarCollapsed ? "collapsed" : ""}`}>
            {page === "library" ? (
              <>
                <div className="albums-scroll">
                  {sidebarEntries.map((entry) => {
                    const isReorderable = !entry.isSystem;
                    const selected = selectedCollectionId === entry.id;

                    return (
                      <div
                        key={entry.id}
                        role="button"
                        tabIndex={0}
                        className={`album-row ${selected ? "selected" : ""} ${dragOverCollectionId === entry.id ? "drag-over" : ""} ${draggedCollectionId === entry.id ? "dragging" : ""} ${entry.isSystem ? "system-row" : ""} ${isReorderable ? "reorderable" : ""}`}
                        onClick={() => {
                          setSelectedCollectionId(entry.id);
                          setContextMenu(null);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedCollectionId(entry.id);
                            setContextMenu(null);
                          }
                        }}
                        onContextMenu={isReorderable ? (event) => handleCollectionContextMenu(event, entry.id, entry.name) : undefined}
                        draggable={isReorderable}
                        onDragStart={isReorderable ? (event) => handleCollectionDragStart(event, entry.id) : undefined}
                        onDragOver={isReorderable ? (event) => handleCollectionDragOver(event, entry.id) : undefined}
                        onDrop={isReorderable ? (event) => handleCollectionDrop(event, entry.id) : undefined}
                        onDragEnd={isReorderable ? handleCollectionDragEnd : undefined}
                        title={entry.name}
                      >
                        <div className="album-leading">
                          <span className="album-icon-wrap">
                            <FolderIcon filled={selected} />
                          </span>
                          <span className="album-label">{entry.name}</span>
                        </div>
                        <small>{entry.itemCount}</small>
                      </div>
                    );
                  })}
                </div>

                <div className="sidebar-actions">
                  <button
                    className="icon-action"
                    onClick={() => setIsSidebarCollapsed((current) => !current)}
                    aria-label={isSidebarCollapsed ? "Expandir barra lateral" : "Reduzir barra lateral"}
                    title={isSidebarCollapsed ? "Expandir barra lateral" : "Reduzir barra lateral"}
                  >
                    {isSidebarCollapsed ? <ChevronRightDoubleIcon /> : <ChevronLeftDoubleIcon />}
                  </button>
                  <button className="icon-action" onClick={() => void handleCreateCollection()} aria-label="Criar novo álbum" title="Criar novo álbum">
                    <PlusIcon />
                  </button>
                  <button className="icon-action settings-action" onClick={() => setPage("settings")} aria-label="Abrir configurações" title="Abrir configurações">
                    <SettingsIcon />
                  </button>
                </div>
              </>
            ) : (
              <div className="settings-panel">
                <div>
                  <h2>Settings</h2>
                  <p>Estado atual do login do Discord.</p>
                </div>

                <div className="settings-card">
                  <div className="settings-label">Discord</div>
                  <div className={`settings-status ${isAuthenticated ? "connected" : "disconnected"}`}>
                    {isAuthenticated ? "Connected" : "Not connected"}
                  </div>
                  <button className="primary-button" onClick={openDiscordLogin}>
                    Login with Discord
                  </button>
                </div>

                <div className="settings-card">
                  <div className="settings-label">Janela</div>

                  <label className="settings-toggle" htmlFor="minimize-to-tray">
                    <div className="settings-toggle-copy">
                      <span className="settings-toggle-title">Minimizar para a bandeja</span>
                      <span className="settings-toggle-description">
                        Ao minimizar, esconder o app na área de notificação.
                      </span>
                    </div>
                    <input
                      id="minimize-to-tray"
                      className="settings-switch-input"
                      type="checkbox"
                      checked={minimizeToTray}
                      onChange={(event) => setMinimizeToTray(event.currentTarget.checked)}
                    />
                    <span className="settings-switch" aria-hidden="true" />
                  </label>

                  <label className="settings-toggle" htmlFor="close-to-tray">
                    <div className="settings-toggle-copy">
                      <span className="settings-toggle-title">Fechar para a bandeja</span>
                      <span className="settings-toggle-description">
                        Ao fechar, manter o app rodando em segundo plano na bandeja.
                      </span>
                    </div>
                    <input
                      id="close-to-tray"
                      className="settings-switch-input"
                      type="checkbox"
                      checked={closeToTray}
                      onChange={(event) => setCloseToTray(event.currentTarget.checked)}
                    />
                    <span className="settings-switch" aria-hidden="true" />
                  </label>
                </div>

                <button className="secondary-button" onClick={() => setPage("library")}>Voltar</button>
              </div>
            )}
          </aside>

          <main
            className={`library-panel ${isDraggingFiles ? "dragging" : ""}`}
            onDragEnter={handleFileDragEnter}
            onDragLeave={handleFileDragLeave}
            onDragOver={handleFileDragOver}
            onDrop={(event) => {
              void handleFileDrop(event);
            }}
          >
            {page === "library" ? (
              <>
                <div className="files-grid">
                  {visibleItems.map((item) => (
                    <article key={item.id} className="file-card" title={item.name}>
                      <div className="file-preview" />
                      <div className="file-meta">
                        <strong>{item.name}</strong>
                        <small>{formatBytes(item.size)}</small>
                      </div>
                    </article>
                  ))}
                  {visibleItems.length === 0 && !isBusy && (
                    <div className="empty-state">
                      <strong>Nenhum arquivo ainda.</strong>
                      <span>Arraste arquivos do Explorer para esta área.</span>
                    </div>
                  )}
                </div>

                {isDraggingFiles && (
                  <div className="drop-overlay">
                    <strong>Solte os arquivos aqui</strong>
                    <span>Eles serão adicionados à visualização atual.</span>
                  </div>
                )}
              </>
            ) : (
              <div className="settings-placeholder">
                <strong>Abra a biblioteca para visualizar os arquivos.</strong>
              </div>
            )}
          </main>
        </div>
      </div>

      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="context-menu-item"
            onClick={() => void handleMoveCollection(contextMenu.collectionId, "up")}
            disabled={!canMoveCollection(contextMenu.collectionId, "up")}
          >
            Mover para cima
          </button>
          <button
            type="button"
            className="context-menu-item"
            onClick={() => void handleMoveCollection(contextMenu.collectionId, "down")}
            disabled={!canMoveCollection(contextMenu.collectionId, "down")}
          >
            Mover para baixo
          </button>
          <div className="context-menu-separator" />
          <button
            type="button"
            className="context-menu-item danger"
            onClick={() => void handleDeleteCollection(contextMenu.collectionId, contextMenu.collectionName)}
          >
            Excluir pasta
          </button>
        </div>
      )}

      {(message || error) && (
        <div className="status-toast">
          {message ? <span>{message}</span> : null}
          {error ? <span className="status-error">{error}</span> : null}
        </div>
      )}
    </div>
  );
}
