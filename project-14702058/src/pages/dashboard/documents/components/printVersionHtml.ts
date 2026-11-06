/**
 * Export a rendered version page to PDF via the browser's own print dialog.
 *
 * The version's readable surface is an `<iframe srcDoc=…>`, and the browser will
 * NOT render an iframe's inner document when the PARENT page is printed — cloning
 * the host node would produce a blank page. So instead we render the version's
 * `preview.html` string into a fresh, hidden, same-origin iframe and print THAT
 * document directly, which exports exactly the version on screen (its own design,
 * text and pagination).
 */
export function printVersionHtml(html: string, title: string): void {
  if (!html) return;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.tabIndex = -1;
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = iframe.contentDocument;
  if (!win || !doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();
  // Naming the frame document lets the browser suggest the version's name as the
  // saved PDF's filename where it supports it.
  try {
    doc.title = title;
  } catch {
    // Some browsers ignore a programmatic title; the print still proceeds.
  }

  let printed = false;
  const doPrint = () => {
    if (printed) return;
    printed = true;
    try {
      win.focus();
      win.print();
    } finally {
      // Give the (modal, blocking) print dialog time to grab the document before
      // tearing the frame down.
      window.setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1500);
    }
  };

  // Prefer printing once the written document has loaded (fonts/images in place);
  // fall back to a short timer in case the load event has already fired.
  iframe.addEventListener("load", doPrint, { once: true });
  window.setTimeout(doPrint, 700);
}