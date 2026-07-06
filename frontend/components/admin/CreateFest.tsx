"use client";

// NOTE: Fest creation is intentionally NOT available in the dashboard.
// Per this app's design, admin/fest onboarding is CLI-driven: a developer runs
// `approveAdminRequest.js`, which creates/links the Fest, sets its adminKey, and
// links it to the admin via `managedFestId`. A fest created from an in-app POST
// would be ORPHANED (no managedFestId owner, no adminKey), so we surface an
// honest, disabled state instead of a broken "Create Fest" form.
export default function CreateFest() {
  return (
    <div className="max-w-2xl bg-white border border-[#C5BAC4] rounded-2xl p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-[#29104A] mb-4">
        Create New Fest
      </h2>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <div className="flex gap-3">
          <svg
            className="w-6 h-6 text-amber-600 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <p className="font-semibold text-amber-800">
              Fest creation isn&apos;t available in the dashboard
            </p>
            <p className="text-sm text-amber-700 mt-1">
              Fests are provisioned during admin onboarding by a developer using
              the <code className="font-mono">approveAdminRequest.js</code>{" "}
              script, which links the fest to your admin account and sets its
              fest key. Creating a fest here would produce an orphaned fest with
              no owner or fest key.
            </p>
            <p className="text-sm text-amber-700 mt-2">
              Need a new fest? Contact your platform administrator.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-5">
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Fest creation is handled during admin onboarding, not here"
          className="px-5 py-2 rounded-lg bg-[#C5BAC4]/40 text-[#6B597F] cursor-not-allowed"
        >
          Create Fest
        </button>
      </div>
    </div>
  );
}
