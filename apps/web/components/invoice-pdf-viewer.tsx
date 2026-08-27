"use client";

import * as React from "react";
import { createPluginRegistration } from "@embedpdf/core";
import { EmbedPDF } from "@embedpdf/core/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import { DocumentContent, DocumentManagerPluginPackage } from "@embedpdf/plugin-document-manager/react";
import { Download as ExportDownload, ExportPluginPackage, useExport } from "@embedpdf/plugin-export/react";
import { FullscreenPluginPackage, FullscreenProvider, useFullscreen } from "@embedpdf/plugin-fullscreen/react";
import { PrintFrame, PrintPluginPackage, usePrint } from "@embedpdf/plugin-print/react";
import { RenderPluginPackage } from "@embedpdf/plugin-render/react";
import { Scroller, ScrollPluginPackage, useScroll } from "@embedpdf/plugin-scroll/react";
import { TilingLayer, TilingPluginPackage } from "@embedpdf/plugin-tiling/react";
import { Viewport, ViewportPluginPackage } from "@embedpdf/plugin-viewport/react";
import { useZoom, ZoomGestureWrapper, ZoomMode, ZoomPluginPackage } from "@embedpdf/plugin-zoom/react";
import { ChevronLeft, ChevronRight, Download, Maximize, Minimize, Minus, Plus, Printer } from "lucide-react";
import { Button } from "@parcelis/ui";

type InvoicePdfViewerProps = {
  fileName: string;
  source: string;
};

function InvoicePdfToolbar({ documentId }: { documentId: string }) {
  const { provides: exportPdf } = useExport(documentId);
  const { provides: fullscreen, state: fullscreenState } = useFullscreen();
  const { provides: print } = usePrint(documentId);
  const { provides: scroll, state: page } = useScroll(documentId);
  const { provides: zoom, state: zoomState } = useZoom(documentId);
  const [isPrinting, setIsPrinting] = React.useState(false);

  function handlePrint() {
    if (!print || isPrinting) return;

    setIsPrinting(true);
    print.print().wait(
      () => setIsPrinting(false),
      () => setIsPrinting(false),
    );
  }

  return (
    <div className="flex min-h-14 w-full min-w-0 max-w-full shrink-0 items-center justify-between gap-3 border-b bg-parcelis-white px-4 pr-14 dark:bg-parcelis-slate">
      <div className="flex items-center gap-1">
        <Button
          aria-label="Previous page"
          disabled={!scroll || page.currentPage <= 1}
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => scroll?.scrollToPreviousPage()}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-20 text-center text-xs text-parcelis-gray">
          Page {page.currentPage} of {page.totalPages}
        </span>
        <Button
          aria-label="Next page"
          disabled={!scroll || page.currentPage >= page.totalPages}
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => scroll?.scrollToNextPage()}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center gap-1">
        <Button
          aria-label="Zoom out"
          disabled={!zoom}
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => zoom?.zoomOut()}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Button
          className="min-w-16"
          disabled={!zoom}
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => zoom?.requestZoom(ZoomMode.FitPage)}
        >
          {Math.round(zoomState.currentZoomLevel * 100)}%
        </Button>
        <Button
          aria-label="Zoom in"
          disabled={!zoom}
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => zoom?.zoomIn()}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button disabled={!print || isPrinting} size="sm" type="button" variant="secondary" onClick={handlePrint}>
          <Printer className="h-4 w-4" /> {isPrinting ? "Preparing…" : "Print"}
        </Button>
        <Button disabled={!exportPdf} size="sm" type="button" onClick={() => exportPdf?.download()}>
          <Download className="h-4 w-4" /> Download
        </Button>
        <Button
          aria-label={fullscreenState.isFullscreen ? "Exit full screen" : "Full screen"}
          disabled={!fullscreen}
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => fullscreen?.toggleFullscreen()}
        >
          {fullscreenState.isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

export function InvoicePdfViewer({ fileName, source }: InvoicePdfViewerProps) {
  const { engine, error, isLoading } = usePdfiumEngine({ fontFallback: null });
  const plugins = React.useMemo(
    () => [
      createPluginRegistration(DocumentManagerPluginPackage, {
        initialDocuments: [{ name: fileName, url: source }],
        maxDocuments: 1,
      }),
      createPluginRegistration(ViewportPluginPackage, { viewportGap: 24 }),
      createPluginRegistration(ScrollPluginPackage, { defaultPageGap: 16 }),
      createPluginRegistration(RenderPluginPackage),
      createPluginRegistration(TilingPluginPackage),
      createPluginRegistration(ZoomPluginPackage, { defaultZoomLevel: ZoomMode.Automatic }),
      createPluginRegistration(PrintPluginPackage),
      createPluginRegistration(ExportPluginPackage, { defaultFileName: fileName }),
      createPluginRegistration(FullscreenPluginPackage),
    ],
    [fileName, source],
  );

  if (error) {
    return <div className="grid h-full place-items-center text-sm text-red-700">Unable to load the PDF preview.</div>;
  }

  if (isLoading || !engine) {
    return <div className="grid h-full place-items-center text-sm text-parcelis-gray">Loading PDF preview…</div>;
  }

  return (
    <EmbedPDF autoMountDomElements={false} engine={engine} plugins={plugins}>
      {({ activeDocumentId }) =>
        activeDocumentId ? (
          <FullscreenProvider className="h-full min-h-0 w-full min-w-0 max-w-full overflow-hidden">
            <DocumentContent documentId={activeDocumentId}>
              {({ isError, isLoaded }) => {
                if (isError) {
                  return (
                    <div className="grid h-full place-items-center text-sm text-red-700">
                      Unable to load the invoice.
                    </div>
                  );
                }

                if (!isLoaded) {
                  return (
                    <div className="grid h-full place-items-center text-sm text-parcelis-gray">Loading invoice…</div>
                  );
                }

                return (
                  <div className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden bg-parcelis-white dark:bg-parcelis-slate">
                    <InvoicePdfToolbar documentId={activeDocumentId} />
                    <Viewport
                      className="min-h-0 w-full min-w-0 max-w-full flex-1 bg-parcelis-porcelain p-6"
                      documentId={activeDocumentId}
                      style={{
                        flex: "1 1 0%",
                        height: 0,
                        maxWidth: "100%",
                        minHeight: 0,
                        minWidth: 0,
                        overflowX: "auto",
                        overflowY: "scroll",
                      }}
                    >
                      <ZoomGestureWrapper documentId={activeDocumentId}>
                        <Scroller
                          documentId={activeDocumentId}
                          renderPage={({ height, pageIndex, width }) => (
                            <div className="relative bg-parcelis-white shadow-sm" style={{ height, width }}>
                              <TilingLayer documentId={activeDocumentId} pageIndex={pageIndex} />
                            </div>
                          )}
                        />
                      </ZoomGestureWrapper>
                    </Viewport>
                  </div>
                );
              }}
            </DocumentContent>
            <ExportDownload />
            <PrintFrame />
          </FullscreenProvider>
        ) : null
      }
    </EmbedPDF>
  );
}
