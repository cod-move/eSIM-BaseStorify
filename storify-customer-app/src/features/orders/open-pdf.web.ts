/**
 * The browser's own viewer, in a tab of its own. The PDF arrives after the
 * tap, so a pop-up blocker may refuse the tab: the file is then downloaded.
 */
export function openPdf(bytes: Uint8Array, name: string): Promise<void> {
  const copy = new Uint8Array(bytes);
  const url = URL.createObjectURL(new Blob([copy], { type: 'application/pdf' }));
  if (!window.open(url, '_blank', 'noopener')) {
    const link = document.createElement('a');
    link.href = url;
    link.download = `invoice-${name.replace(/[^\w-]/g, '_')}.pdf`;
    link.click();
  }
  // The tab has read it by then; the address need not live as long as the page.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return Promise.resolve();
}
