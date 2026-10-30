import { useNavigate } from "react-router-dom";
import { Compass, Home } from "lucide-react";
import { BrandMark } from "@/components/layout";
import { Button, Card } from "@/components/ui";

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <Card className="max-w-md px-8 py-12 text-center">
        <div className="mx-auto mb-5 w-fit">
          <BrandMark size={40} />
        </div>
        <p className="eyebrow">404</p>
        <h1 className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-ink">
          This page kept its secrets
        </h1>
        <p className="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-muted">
          The address does not match anything in the workspace. Head back to the overview or wander
          the catalog.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <Button variant="primary" onClick={() => navigate("/")}>
            <Home className="h-4 w-4" />
            Overview
          </Button>
          <Button variant="secondary" onClick={() => navigate("/explore")}>
            <Compass className="h-4 w-4" />
            Explore
          </Button>
        </div>
      </Card>
    </div>
  );
}
