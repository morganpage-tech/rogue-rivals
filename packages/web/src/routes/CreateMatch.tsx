import { useNavigate } from "react-router-dom";

import { MatchWizard } from "../components/MatchWizard.js";

export function CreateMatch(): React.ReactElement {
  const nav = useNavigate();
  return (
    <div className="page-create">
      <MatchWizard
        onCreated={(_id, path) => {
          nav(path);
        }}
      />
    </div>
  );
}
