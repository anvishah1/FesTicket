// frontend/components/FeatureCard.tsx
export default function FeatureCard({ title, body }: { title: string; body: string; }) {
  return (
    <article className="bg-[var(--surface)] rounded-lg p-5 shadow-soft-lg border">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-lg bg-[var(--surface-page)] flex items-center justify-center text-[var(--text-primary)] font-semibold">
          {/* small icon placeholder */}
          ✓
        </div>
        <div>
          <h4 className="font-semibold text-[var(--text-slate-900)]">{title}</h4>
          <p className="text-sm text-[var(--text-soft)] mt-1">{body}</p>
        </div>
      </div>
    </article>
  );
}
