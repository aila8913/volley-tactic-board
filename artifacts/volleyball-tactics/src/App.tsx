import React from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import TacticsBoard from "@/pages/TacticsBoard";
import MatchList from "@/pages/MatchList";
import ScoreSheet from "@/pages/ScoreSheet";
import MatchAnalytics from "@/pages/MatchAnalytics";
import TournamentDetail from "@/pages/TournamentDetail";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={MatchList} />
      <Route path="/tournaments/:id" component={TournamentDetail} />
      <Route path="/matches/:id/board" component={TacticsBoard} />
      <Route path="/matches/:id/record" component={ScoreSheet} />
      <Route path="/matches/:id/analytics" component={MatchAnalytics} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
