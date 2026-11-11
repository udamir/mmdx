// @mmdx/studio/adapters — built-in host adapters (storage, themes, documents, diagram history, images, URL resolution).
export * from './adapters/storage.js';
export * from './adapters/themes.js';
export * from './adapters/documents.js';
export * from './adapters/history.js';
export * from './adapters/images.js';
export * from './adapters/urls.js';
// the interfaces they implement (src/ports.ts)
export type { ContentUrlKind, DocumentAdapter, DocumentSaveResult, HistoryAdapter, ImageInfo, ImagePage, ImageStore, LoadResult, SaveResult, StorageAdapter, ThemeSource, ThemeStore, UrlResolver, VersionInfo } from './ports.js';
