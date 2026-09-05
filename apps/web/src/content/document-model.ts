export interface ReleaseDocumentSection {
  readonly id: string;
  readonly heading: string;
  readonly body: readonly string[];
}

export interface ReleaseDocument {
  readonly title: string;
  readonly description: string;
  readonly draftLabel?: string;
  readonly sections: readonly ReleaseDocumentSection[];
}
