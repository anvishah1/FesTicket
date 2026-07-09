// PAY-07: stream a GST tax-invoice / receipt PDF for a completed booking.
//
// Generation is streaming (piped straight to the response) so a large invoice is
// never buffered in memory. Money is INTEGER PAISE (PAY-03). The built-in
// Helvetica font has no rupee glyph (U+20B9), so amounts are prefixed "Rs.".
import PDFDocument from "pdfkit";

const money = (paise) => "Rs. " + ((Number(paise) || 0) / 100).toFixed(2);

// Set Content-Type / Content-Disposition then pipe the generated PDF to `res`.
export function streamInvoicePdf(res, { booking, event, fest }) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="invoice-${booking.bookingCode}.pdf"`);

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  doc.pipe(res);

  const RIGHT = 545; // right edge inside the margins
  const LABEL_X = 360;
  const AMT_X = 445;
  const AMT_W = 100;

  // Seller header (fest + college, falling back to the app name).
  doc.fontSize(20).fillColor("#29104A").text(fest?.name || event?.name || "FesTicket");
  if (fest?.college) doc.fontSize(10).fillColor("#666").text(fest.college);
  doc.moveDown(0.4);
  doc.fontSize(15).fillColor("#000").text("Tax Invoice / Receipt");
  doc.moveDown(0.6);

  // Invoice + buyer meta.
  doc.fontSize(10).fillColor("#333");
  doc.text(`Invoice No: ${booking.invoiceNumber || "-"}`);
  const date = booking.purchaseDate || booking.createdAt;
  doc.text(`Date: ${date ? new Date(date).toISOString().slice(0, 10) : "-"}`);
  doc.text(`Booking Code: ${booking.bookingCode}`);
  doc.text(`Status: ${booking.status}`);
  doc.moveDown(0.4);

  const buyerName = booking.user?.name || booking.guestName || "Guest";
  const buyerEmail = booking.user?.email || booking.guestEmail || "";
  doc.text(`Billed to: ${buyerName}`);
  if (buyerEmail) doc.text(buyerEmail);
  doc.moveDown(0.6);

  // Event line.
  doc.fillColor("#000").fontSize(12).text(event?.name || "Event");
  doc.fontSize(10).fillColor("#333");
  if (event?.venue) doc.text(event.venue);
  if (event?.startDate) doc.text(new Date(event.startDate).toISOString().slice(0, 10));
  doc.moveDown(0.6);

  // Line-items table.
  doc.fillColor("#000").fontSize(10);
  let y = doc.y;
  doc.text("Item", 50, y);
  doc.text("Qty", 300, y);
  doc.text("Unit", 360, y);
  doc.text("Amount", AMT_X, y, { width: AMT_W, align: "right" });
  y += 16;
  doc.moveTo(50, y - 3).lineTo(RIGHT, y - 3).strokeColor("#ccc").stroke();
  for (const it of booking.items || []) {
    doc.fillColor("#000").text(it.ticketType?.name || "Ticket", 50, y, { width: 240 });
    doc.text(String(it.quantity ?? 0), 300, y);
    doc.text(money(it.unitPrice), 360, y);
    doc.text(money(it.totalPrice), AMT_X, y, { width: AMT_W, align: "right" });
    y += 16;
  }
  doc.moveTo(50, y).lineTo(RIGHT, y).strokeColor("#ccc").stroke();
  y += 10;

  const line = (label, val, bold = false) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fillColor("#000");
    doc.text(label, LABEL_X, y);
    doc.text(val, AMT_X, y, { width: AMT_W, align: "right" });
    y += 15;
  };
  line("Subtotal", money(booking.subtotal));
  if (booking.discount) line("Discount", "-" + money(booking.discount));
  if (booking.promoDiscount) line("Promo", "-" + money(booking.promoDiscount));
  line("Platform fee (2%)", money(booking.platformFee));
  line("GST (18%)", money(booking.tax));
  line("Total", money(booking.total), true);
  if (booking.refundedAmount) line("Refunded", "-" + money(booking.refundedAmount));

  // Footer.
  doc.font("Helvetica").fontSize(9).fillColor("#666");
  doc.moveDown(2);
  const txn = booking.payment?.transactionId;
  if (txn) doc.text(`Payment reference: ${txn}`, 50, doc.y);
  doc.moveDown(0.4);
  doc.text("This is a computer-generated receipt.", 50, doc.y);

  doc.end();
}
