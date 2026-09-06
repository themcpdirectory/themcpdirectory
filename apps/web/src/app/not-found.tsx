import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" tabIndex={-1} className="status-layout">
      <div className="status-panel">
        <p className="status-code">404</p>
        <h1 className="page-title">Page not found</h1>
        <p className="page-description">
          The server or page you are looking for does not exist or has been removed.
        </p>
        <Link href="/" className="text-link-action text-link-action--primary">
          Back to directory
        </Link>
      </div>
    </main>
  );
}
