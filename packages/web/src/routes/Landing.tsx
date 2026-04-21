import { Link } from "react-router-dom";

import { MatchList } from "../components/MatchList.js";

export function Landing(): React.ReactElement {
  return (
    <div className="landing">
      <header className="landing-header">
        <h1>Rogue Rivals</h1>
        <Link to="/create" className="landing-create-link">Create match</Link>
      </header>
      <MatchList />
    </div>
  );
}
