import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AtriumGame } from "@/components/AtriumGame";
import "@/styles.css";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("missing root");

createRoot(root).render(
  <StrictMode>
    <main className="h-dvh w-full overflow-hidden bg-bg">
      <AtriumGame />
    </main>
  </StrictMode>,
);
