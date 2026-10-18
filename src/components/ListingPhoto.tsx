import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

const ListingPhoto = ({
  path,
  analysis,
  name,
}: {
  path: string | null;
  analysis: Json | null;
  name: string;
}) => {
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setUrl("");
    setError(false);
    if (!path) return;
    const refresh = async () => {
      const { data, error } = await supabase.storage
        .from("food-photos")
        .createSignedUrl(path, 3600);
      if (active) {
        setUrl(data?.signedUrl || "");
        setError(Boolean(error));
      }
    };
    refresh();
    const interval = window.setInterval(refresh, 50 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [path]);
  const description =
    analysis &&
    typeof analysis === "object" &&
    !Array.isArray(analysis) &&
    typeof analysis.description === "string"
      ? analysis.description
      : "";
  if (!path && !description) return null;
  return (
    <div className="mb-2 w-24 shrink-0 space-y-1 sm:w-28">
      {url && !error && (
        <img
          src={url}
          alt={name}
          onError={() => setError(true)}
          className="h-20 w-24 rounded-lg bg-muted/30 object-cover sm:w-28"
        />
      )}
      {error && (
        <p className="text-xs text-muted-foreground">Photo unavailable.</p>
      )}
      {description && (
        <p className="line-clamp-3 text-xs text-muted-foreground">
          <span className="font-medium">Description: </span>
          {description}
        </p>
      )}
    </div>
  );
};

export default ListingPhoto;
