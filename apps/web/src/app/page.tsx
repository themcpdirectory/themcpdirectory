export default function Home() {
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:rounded focus:bg-white focus:p-4 focus:text-black focus:outline focus:outline-2 focus:outline-black"
      >
        Skip to main content
      </a>
      <main id="main-content" className="flex min-h-screen flex-col items-start p-8" tabIndex={-1}>
        <h1 className="text-2xl font-semibold">The MCP Directory</h1>
        <p className="mt-4 text-base">The open directory for the MCP ecosystem. Coming soon.</p>
      </main>
    </>
  );
}
