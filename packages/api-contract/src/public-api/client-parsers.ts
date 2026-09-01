export class UnsupportedManifestVersionError extends Error {
  constructor(readonly schemaVersion: number) {
    super(`Unsupported install manifest schema version: ${schemaVersion}`);
    this.name = "UnsupportedManifestVersionError";
  }
}