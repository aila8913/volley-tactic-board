import { useParams, Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { useMatches } from '@/hooks/useMatches';

// 佔位頁面——對應 docs/product-spec.md 的「賽中即時記錄／賽後影片補填」，
// 點球場座標、選球員動作、計分這些核心功能還沒做，先把入口跟路由架好。
export default function MatchRecording() {
  const { id } = useParams<{ id: string }>();
  const match = useMatches((state) => state.matches.find((m) => m.id === id));

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-white px-4 text-center">
      <h1 className="text-2xl font-bold">{match ? match.name : '比賽紀錄'}</h1>
      <p className="text-muted-foreground">記錄功能開發中，敬請期待。</p>
      <Button asChild variant="outline">
        <Link href="/">回到比賽列表</Link>
      </Button>
    </div>
  );
}
