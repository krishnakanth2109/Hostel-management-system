export const VACATING_REFUND_NOTICE =
  "Please inform the hostel management at least 10 days before vacating to get your advance amount refunded. If you fail to inform 10 days before, then the advance amount will not be refunded.";

const noticeHtml = `
  <div role="note" style="margin:18px 0 0;padding:14px 16px;background:#fff7ed;border-left:4px solid #f59e0b;border-radius:0 10px 10px 0;color:#4b5563;font-family:'Segoe UI',Tahoma,Arial,sans-serif;font-size:12px;line-height:1.7;box-sizing:border-box;">
    <strong style="color:#92400e;">Note:</strong> ${VACATING_REFUND_NOTICE}
  </div>`;

const automatedFooterHtml = `
  <div style="max-width:560px;margin:0 auto;padding:15px;text-align:center;background:#f8fafc;color:#94a3b8;font-family:'Segoe UI',Tahoma,Arial,sans-serif;font-size:11px;box-sizing:border-box;">
    Hostel Manager &middot; This is an automated message.
  </div>`;

export function addVacatingRefundNote(htmlContent) {
  const html = String(htmlContent || "");
  if (html.includes(VACATING_REFUND_NOTICE)) return html;

  const divFooterIndex = html.indexOf('<div class="footer">');
  if (divFooterIndex !== -1) {
    return `${html.slice(0, divFooterIndex)}${noticeHtml}\n${html.slice(divFooterIndex)}`;
  }

  const lowerHtml = html.toLowerCase();
  const automatedTextIndexes = [
    lowerHtml.indexOf("this is an automated message"),
    lowerHtml.indexOf("automated email from"),
  ].filter((index) => index !== -1);
  const automatedTextIndex = automatedTextIndexes.length ? Math.min(...automatedTextIndexes) : -1;

  if (automatedTextIndex !== -1) {
    const bodyCellEndIndex = lowerHtml.lastIndexOf("</td>", automatedTextIndex);
    if (bodyCellEndIndex !== -1) {
      return `${html.slice(0, bodyCellEndIndex)}${noticeHtml}\n${html.slice(bodyCellEndIndex)}`;
    }
  }

  const closingBodyIndex = lowerHtml.lastIndexOf("</body>");
  const noteAndFooter = `${noticeHtml}${automatedFooterHtml}`;
  if (closingBodyIndex === -1) return `${html}${noteAndFooter}`;

  return `${html.slice(0, closingBodyIndex)}${noteAndFooter}\n${html.slice(closingBodyIndex)}`;
}
