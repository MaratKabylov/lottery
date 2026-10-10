import { Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
export function Brand() {
  return (
    <Link className="brand" to="/">
      <span>
        <Sparkles size={22} />
      </span>
      EventDraw<span className="brand-dot">.</span>
    </Link>
  );
}
