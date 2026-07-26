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
import CrossMatchAnalytics from "@/pages/CrossMatchAnalytics";
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
      {/* 不帶 matchId 的跨場彙總頁（#65 M2 視圖②），跟上面單場的 /matches/:id/analytics
          是兩個不同的頁面，別搞混——這支要放在具體路徑之後、NotFound 之前。 */}
      <Route path="/analytics" component={CrossMatchAnalytics} />
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
