import { useSyncExternalStore } from "react";
import {
  createApplication,
  listApplications,
  normalizeStatus,
  updateApplicationStatus,
  type Application,
  type ApplicationStatus,
  type CreateApplicationInput,
} from "@/lib/applications";

// Shared application cache so the weekly goal, the pipeline board, and
// quick-apply actions all stay in sync without relying on route remounts.

let applications: Application[] = [];
const listeners = new Set<() => void>();

// Bumped on every local mutation. A refresh that started before a mutation must
// NOT overwrite newer local truth — otherwise a quick-apply that lands while the
// page's initial refresh is still resolving gets wiped by the earlier snapshot
// (which is why the pipeline count could snap back to 0).
let mutationSeq = 0;

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return applications;
}

function setApplications(next: Application[]) {
  applications = next.map((app) => ({ ...app, status: normalizeStatus(app.status) }));
  mutationSeq += 1;
  emit();
}

/** Re-fetch applications from the backend and update the shared cache. */
export async function refreshApplications(): Promise<void> {
  const startedAt = mutationSeq;
  const list = await listApplications();
  // A local mutation happened while this was in flight — keep the newer local
  // state instead of clobbering it with the stale response.
  if (startedAt !== mutationSeq) return;
  applications = (list ?? []).map((app) => ({ ...app, status: normalizeStatus(app.status) }));
  emit();
}

export function addApplication(app: Application) {
  setApplications([...applications, { ...app, status: normalizeStatus(app.status) }]);
}

/**
 * Create an application and drop it straight into the shared cache. The input's
 * identity fields are merged back in so the pipeline can still key off
 * job_id / title / company when the backend echoes a slimmer projection than it
 * was given. Returns the stored application.
 */
export async function createAndAddApplication(
  input: CreateApplicationInput,
): Promise<Application> {
  const created = await createApplication(input);
  const merged: Application = {
    ...created,
    job_id: created?.job_id ?? input.job_id,
    title: created?.title || input.title,
    company: created?.company || input.company,
    status: normalizeStatus(created?.status),
  };
  setApplications([...applications, merged]);
  return merged;
}

export function updateApplication(app: Application) {
  setApplications(
    applications.map((a) =>
      a.id === app.id ? { ...app, status: normalizeStatus(app.status) } : a,
    ),
  );
}

/**
 * Move a pipeline entry to a new stage and reflect it in the shared cache right
 * away. Merges the response over the existing record so the row keeps its job
 * link / title / company even if the backend echoes a slim projection, and falls
 * back to a local-only update in preview so the move still lands with no backend.
 */
export async function moveApplicationStatus(
  id: string | number,
  status: ApplicationStatus,
): Promise<Application | undefined> {
  const updated = __IS_PREVIEW__
    ? ({ id, status } as Application)
    : await updateApplicationStatus(id, status);
  let moved: Application | undefined;
  applications = applications.map((a) => {
    if (a.id !== id) return a;
    moved = { ...a, ...updated, id: a.id, status: normalizeStatus(updated?.status ?? status) };
    return moved;
  });
  mutationSeq += 1;
  emit();
  return moved;
}

export function removeApplication(id: string | number) {
  setApplications(applications.filter((a) => a.id !== id));
}

export function useApplications() {
  const apps = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    applications: apps,
    refresh: refreshApplications,
    addApplication,
    createAndAddApplication,
    updateApplication,
    moveApplicationStatus,
    removeApplication,
  };
}