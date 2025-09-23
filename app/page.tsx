export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold mb-8">Set 4 Service - E2E Plan Review</h1>
        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">255 California Street Accessibility Review</h2>
          <p className="text-gray-600 mb-4">
            Comprehensive accessibility code review and compliance verification system.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border rounded-lg p-6">
            <h3 className="text-xl font-semibold mb-3">Review Process</h3>
            <p className="text-gray-600">
              Automated and manual review processes for building accessibility compliance.
            </p>
          </div>

          <div className="border rounded-lg p-6">
            <h3 className="text-xl font-semibold mb-3">Documentation</h3>
            <p className="text-gray-600">
              SAAIA drawing analysis and compliance documentation management.
            </p>
          </div>

          <div className="border rounded-lg p-6">
            <h3 className="text-xl font-semibold mb-3">Data Management</h3>
            <p className="text-gray-600">
              Secure storage and retrieval of architectural drawings and review data.
            </p>
          </div>

          <div className="border rounded-lg p-6">
            <h3 className="text-xl font-semibold mb-3">Reporting</h3>
            <p className="text-gray-600">
              Generate comprehensive accessibility compliance reports.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}