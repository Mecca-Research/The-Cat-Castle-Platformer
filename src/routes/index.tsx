import { createFileRoute } from "@tanstack/react-router";
import { AtriumGame } from "@/components/AtriumGame";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <main className="h-dvh w-full overflow-hidden bg-bg">
      <AtriumGame />
    </main>
  );
}
