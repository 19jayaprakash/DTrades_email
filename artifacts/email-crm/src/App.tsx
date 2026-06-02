import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider } from "@/contexts/AuthContext";
import { setupApi } from "@/lib/api";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Compose from "@/pages/compose";
import History from "@/pages/history";
import Templates from "@/pages/templates";
import Accounts from "@/pages/accounts";
import Documents from "@/pages/documents";
import Users from "@/pages/users";
import Errors from "@/pages/errors";

setupApi();
const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/compose" component={Compose} />
      <Route path="/history" component={History} />
      <Route path="/templates" component={Templates} />
      <Route path="/accounts" component={Accounts} />
      <Route path="/documents" component={Documents} />
      <Route path="/attachments" component={Documents} />
      <Route path="/users" component={Users} />
      <Route path="/errors" component={Errors} />

      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <AuthProvider>
          <TooltipProvider>
            <Router />
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
