import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { CreateMatch } from "./routes/CreateMatch.js";
import { Landing } from "./routes/Landing.js";
import { PlayMatch } from "./routes/PlayMatch.js";
import { WatchMatch } from "./routes/WatchMatch.js";

/** Thin client: UI + server API only (`@rr/shared` types — no engine in the bundle). */
export function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/create" element={<CreateMatch />} />
          <Route path="/watch/:matchId" element={<WatchMatch />} />
          <Route path="/play/:matchId" element={<PlayMatch />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
