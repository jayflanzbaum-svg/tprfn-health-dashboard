import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SmsAlertsSignup from "./pages/SmsAlertsSignup";
import SmsTerms from "./pages/SmsTerms";
import Privacy from "./pages/Privacy";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import ImportSyslog from "./pages/ImportSyslog";
import LiveMapPage from "./pages/LiveMapPage";
import NotFound from "./pages/NotFound";
import DashboardOverview from "./pages/DashboardOverview";
import HubDirectory from "./pages/HubDirectory";
import EmbedMap from "./pages/EmbedMap";
import ResetPassword from "./pages/ResetPassword";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/import" element={<ImportSyslog />} />
          <Route path="/live-map" element={<LiveMapPage />} />
          <Route path="/overview" element={<DashboardOverview />} />
          <Route path="/hubs" element={<HubDirectory />} />
          <Route path="/embed" element={<EmbedMap />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/alerts" element={<SmsAlertsSignup />} />
          <Route path="/sms-terms" element={<SmsTerms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
