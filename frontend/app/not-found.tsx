import Link from "next/link";

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "#fbf9f6" }}
    >
      <div className="w-full max-w-md text-center">
        <p
          className="text-sm font-semibold tracking-wide uppercase"
          style={{ color: "#522C5D" }}
        >
          tiqr
        </p>
        <h1
          className="mt-3 text-6xl font-extrabold"
          style={{ color: "#522C5D" }}
        >
          404
        </h1>
        <h2 className="mt-2 text-xl font-semibold text-gray-800">
          Page not found
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          The page you&apos;re looking for doesn&apos;t exist or may have been
          moved.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-lg px-6 py-3 font-medium text-white transition hover:opacity-90"
          style={{ backgroundColor: "#522C5D" }}
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
