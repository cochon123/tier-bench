"use client";

import { useEffect, useMemo, useState } from "react";
import type { CatalogApiModel } from "./lib/model-catalog";
import { mergeCatalogModels } from "./lib/model-catalog";

export function useModelCatalog(pinnedModels: CatalogApiModel[] = []) {
  const [catalog, setCatalog] = useState<CatalogApiModel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/models", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const body = await response.json() as { data?: unknown };
        if (Array.isArray(body.data)) setCatalog(body.data as CatalogApiModel[]);
      })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const availableModels = useMemo(() => mergeCatalogModels(catalog, pinnedModels), [catalog, pinnedModels]);
  return { availableModels, catalogLoading: loading };
}
