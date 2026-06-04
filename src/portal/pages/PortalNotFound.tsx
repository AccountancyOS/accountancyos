import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function PortalNotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-3xl font-semibold">Page Not Found</h1>
      <p className="text-sm text-muted-foreground">
        The page you are looking for does not exist in the client portal.
      </p>
      <Button asChild>
        <Link to="/portal/dashboard">Back To Dashboard</Link>
      </Button>
    </div>
  );
}