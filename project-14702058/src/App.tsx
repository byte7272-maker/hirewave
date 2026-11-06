import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./router";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import { ToastProvider } from "./components/base/ToastProvider";
import { GlossaryProvider } from "./components/feature/GlossaryProvider";
import { NarrationProvider } from "./components/feature/NarrationProvider";
import { BrandingProvider } from "./hooks/useBranding";
import SessionExpiryGuard from "./components/feature/SessionExpiryGuard";
import SessionRefreshNotice from "./components/feature/SessionRefreshNotice";
import ApiUnreachableBanner from "./components/feature/ApiUnreachableBanner";
import RouteErrorBoundary from "./components/feature/RouteErrorBoundary";


function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <BrandingProvider>
        <BrowserRouter basename={__BASE_PATH__}>
          <RouteErrorBoundary>
            <ToastProvider>
              <SessionExpiryGuard />
              <SessionRefreshNotice />
              <ApiUnreachableBanner />
              <NarrationProvider>
                <GlossaryProvider>
                  <AppRoutes />
                </GlossaryProvider>
              </NarrationProvider>
            </ToastProvider>
          </RouteErrorBoundary>
        </BrowserRouter>
      </BrandingProvider>
    </I18nextProvider>
  );
}

export default App;