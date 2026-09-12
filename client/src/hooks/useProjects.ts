import { useCallback, useEffect, useState } from "react";
import { api } from "../services/api";
import type { Project } from "../types/api";

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listProjects();
      setProjects(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createProject = useCallback(
    async (input: Partial<Project> & { title: string }) => {
      const project = await api.createProject(input);
      await refresh();
      return project;
    },
    [refresh]
  );

  const deleteProject = useCallback(
    async (id: string) => {
      await api.deleteProject(id);
      await refresh();
    },
    [refresh]
  );

  return { projects, loading, error, refresh, createProject, deleteProject };
}
