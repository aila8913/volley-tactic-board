import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

// 「回比賽列表」按鈕：原本每個頁面各自刻一份，長相跟文字都不統一——TacticsBoard/
// ScoreSheet 用純文字「← 比賽列表」，TournamentDetail 用「回到比賽列表」+ ArrowLeft
// icon，NotFound 頁面甚至整個沒有這顆按鈕，使用者從那邊卡住只能按瀏覽器的上一頁。
// 抽成共用元件後外觀統一、每個頁面都有，之後想調整長相也只要改這一個地方。
interface BackToMatchListButtonProps {
  // 大部分頁面回最外層的比賽列表（"/"）就好；但 TacticsBoard/ScoreSheet 是某個
  // 資料夾（tournament）底下的比賽時，應該回「資料夾內頁」而不是最外層列表，
  // 所以把目的地開放給外部傳入，而不是寫死。
  href?: string;
  // 只讓外部調整版面用的間距（例如放在頁面最上方 vs. 放在 header 列裡），
  // 不開放 variant/size，維持每個頁面看到的按鈕長相一致。
  className?: string;
}

export default function BackToMatchListButton({
  href = "/",
  className,
}: BackToMatchListButtonProps) {
  return (
    <Button asChild variant="outline" size="sm" className={className}>
      <Link href={href}>
        <ArrowLeft className="mr-1 h-4 w-4" />
        比賽列表
      </Link>
    </Button>
  );
}
