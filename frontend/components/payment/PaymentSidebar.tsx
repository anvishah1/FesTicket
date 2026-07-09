import { formatPaise } from "@/lib/format";

type Props = {
  title: string;
  amount: number;
  orderId: string;
  venue?: string;
  date?: string;
};

export default function PaymentSidebar({ title, amount, orderId, venue, date }: Props) {
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="rounded-lg p-4 border bg-[var(--surface)] shadow-sm">
      <h4 className="font-semibold">Payment Summary</h4>

      <div className="mt-3">
        <div className="text-sm font-medium text-[var(--text-slate-800)]">{title}</div>
        {(venue || date) && (
          <div className="text-xs text-[var(--text-soft)] mt-1">
            {venue && <span>{venue}</span>}
            {venue && date && <span> · </span>}
            {date && <span>{formatDate(date)}</span>}
          </div>
        )}
      </div>

      <div className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-[var(--text-slate)]">Order ID</span>
          <span className="font-mono text-xs bg-[var(--surface-slate-100)] px-2 py-0.5 rounded">{orderId}</span>
        </div>

        <div className="border-t my-2 pt-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Total Amount</div>
            <div className="text-2xl font-bold text-[var(--text-primary)]">{formatPaise(amount)}</div>
          </div>
        </div>
      </div>

      <div className="mt-4 text-xs text-[var(--text-soft)]">
        Payments are processed securely. Your tickets will be sent to your email after successful payment.
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-[var(--text-faint)]">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        Secure payment
      </div>
    </div>
  );
}
