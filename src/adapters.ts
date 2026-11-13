// @mmdx/studio/adapters — built-in host adapters (storage, themes, documents, diagram history, images, URL resolution).
export {
  localStorageAdapter, memoryStorage, preloadedStorage, type PreloadedStorageOptions,
} from './adapters/storage.js';
export {
  fetchThemeSource, isLocalEdit, localStorageThemeStore, memoryThemeStore,
} from './adapters/themes.js';
export {
  httpDocumentAdapter, memoryDocumentAdapter,
} from './adapters/documents.js';
export {
  contentId, httpHistoryAdapter, staticHistory, type StaticVersion,
} from './adapters/history.js';
export {
  httpImageStore, memoryImageStore, type MemoryImageStoreOptions,
} from './adapters/images.js';
export {
  relativeUrlResolver,
} from './adapters/urls.js';
// the interfaces they implement (src/ports.ts)
export type { ContentUrlKind, DocumentAdapter, DocumentSaveResult, HistoryAdapter, ImageInfo, ImagePage, ImageStore, LoadResult, SaveResult, StorageAdapter, ThemeSource, ThemeStore, UrlResolver, VersionInfo } from './ports.js';
