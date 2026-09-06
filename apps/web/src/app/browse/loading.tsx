export default function BrowseLoading() {
  return (
    <main id="main-content" tabIndex={-1} className="page-shell" aria-busy="true">
      <div className="page-container">
        <div className="page-header browse-loading__header">
          <h1 className="page-title">Loading browse results…</h1>
          <p className="page-description">Fetching the current directory view.</p>
        </div>
        <div className="browse-loading__grid">
          <div className="browse-loading__panel" />
          <div className="browse-loading__panel browse-loading__panel--wide" />
        </div>
      </div>
    </main>
  );
}
