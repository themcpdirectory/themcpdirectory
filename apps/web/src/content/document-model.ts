export interface ReleaseDocumentSectionLink {
  readonly label: string;
  readonly href: string;
}

export interface ReleaseDocumentSection {
  readonly id: string;
  readonly heading: string;
  readonly body: readonly string[];
  /** Optional contextual in-app link(s) rendered after the section body. */
  readonly links?: readonly ReleaseDocumentSectionLink[];
}

export interface ReleaseDocument {
  readonly title: string;
  readonly description: string;
  readonly draftLabel?: string;
  readonly sections: readonly ReleaseDocumentSection[];
}
