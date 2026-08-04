import React from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AuthGate from "@/components/AuthGate";
import NotFound from "@/pages/not-found";
import TacticsBoard from "@/pages/TacticsBoard";
import MatchList from "@/pages/MatchList";
import ScoreSheet from "@/pages/ScoreSheet";
import MatchAnalytics from "@/pages/MatchAnalytics";
import CrossMatchAnalytics from "@/pages/CrossMatchAnalytics";
import PersonAnalytics from "@/pages/PersonAnalytics";
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
      {/* 「視圖③：球員跨場/跨隊分析」(#213)——一樣不帶 matchId，但聚合單位是「人」而不是
          「比賽」，所以另開一個路徑，不跟上面的 /analytics 混用查詢參數區分視圖。 */}
      <Route path="/analytics/people" component={PersonAnalytics} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthGate>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </AuthGate>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
