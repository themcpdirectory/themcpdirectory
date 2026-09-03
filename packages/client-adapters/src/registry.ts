import type { ClientId } from "@themcpdirectory/install-engine";
import type { AdapterRegistry, ClientDetection, McpClientAdapter } from "./types.js";

export type AdapterRegistryErrorCode = "ADAPTER_DUPLICATE_ID" | "ADAPTER_NOT_FOUND";

export class AdapterRegistryError extends Error {
  readonly code: AdapterRegistryErrorCode;
  readonly id: ClientId;

  constructor(code: AdapterRegistryErrorCode, id: ClientId, message: string) {
    super(message);
    this.name = "AdapterRegistryError";
    this.code = code;
    this.id = id;
  }
}

class DefaultAdapterRegistry implements AdapterRegistry {
  readonly #adapters: readonly McpClientAdapter[];
  readonly #byId: ReadonlyMap<ClientId, McpClientAdapter>;

  constructor(adapters: readonly McpClientAdapter[]) {
    const ordered = [...adapters];
    const byId = new Map<ClientId, McpClientAdapter>();

    for (const adapter of ordered) {
      if (byId.has(adapter.id)) {
        throw new AdapterRegistryError(
          "ADAPTER_DUPLICATE_ID",
          adapter.id,
          `Duplicate adapter registration for ${adapter.id}`,
        );
      }

      byId.set(adapter.id, adapter);
    }

    this.#adapters = Object.freeze(ordered);
    this.#byId = byId;
  }

  list(): readonly McpClientAdapter[] {
    return Object.freeze([...this.#adapters]);
  }

  get(id: ClientId): McpClientAdapter {
    const adapter = this.#byId.get(id);
    if (!adapter) {
      throw new AdapterRegistryError("ADAPTER_NOT_FOUND", id, `No adapter registered for ${id}`);
    }

    return adapter;
  }

  async detectAll(): Promise<readonly ClientDetection[]> {
    const detections: ClientDetection[] = [];
    for (const adapter of this.#adapters) {
      detections.push(await adapter.detect());
    }

    return Object.freeze(detections);
  }
}

export function createAdapterRegistry(adapters: readonly McpClientAdapter[]): AdapterRegistry {
  return new DefaultAdapterRegistry(adapters);
}
