import { V2Shell } from "./v2/V2Shell.js";

/** v2 rules: @rr/engine2 + optional HTTP LLM opponents. */
export function App() {
  return (
    <div className="app">
      <V2Shell />
    </div>
  );
}
