export { RegistryPageSchema } from "./schema.js";
export type {
  RegistryPage,
  RegistryServerResponse,
  RegistryServerJSON,
  RegistryMetadata,
} from "./schema.js";

export { OfficialRegistryClient, RegistryError } from "./client.js";
export type { RegistryClientOptions, RegistryErrorKind, PagesOptions } from "./client.js";
export {
  VALID_EMPTY_PAGE,
  VALID_LAST_PAGE,
  VALID_PAGE_WITHOUT_META,
  VALID_REGISTRY_PAGE,
} from "./fixtures.js";
