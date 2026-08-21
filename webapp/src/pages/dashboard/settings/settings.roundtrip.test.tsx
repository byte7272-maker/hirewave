import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/lib/toast";
import Settings from "@/pages/dashboard/settings/page";

// --- A tiny stateful fake backend, wired through a mocked global.fetch. -------
// It persists what the Settings page PUTs, so a fresh render can read it back —
// exactly the profile-save round-trip a real reload performs.
interface Prefs {
  seniority: string | null;
  target_roles: string[];
  remote_ok: boolean;
  salary_range: { currency: string; minimum: number | null; maximum: number | null };
}
interface Profile {
  headline: string;
  summary: string;
  skills: string[];
  preferences: Prefs;
}

function emptyProfile(): Profile {
  return {
    headline: "",
    summary: "",
    skills: [],
    preferences: {
      seniority: null,
      target_roles: [],
      remote_ok: true,
      salary_range: { currency: "USD", minimum: null, maximum: null },
    },
  };
}

interface Backend {
  profile: Profile;
  puts: { path: string; body: unknown }[];
}

function installFakeBackend(): Backend {
  const backend: Backend = { profile: emptyProfile(), puts: [] };
  const user = { id: "u1", email: "thabo@example.com", full_name: "Thabo Nkosi", location: "" };

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: { method?: string; body?: unknown }) => {
    const path = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body as string) : undefined;

    if (path.endsWith("/api/v1/users/me") && method === "GET") return json(user);
    if (path.endsWith("/api/v1/users/me/profile") && method === "GET") return json(backend.profile);
    if (path.endsWith("/api/v1/resumes") && method === "GET") return json([]);

    if (path.endsWith("/api/v1/users/me") && method === "PUT") {
      backend.puts.push({ path, body });
      backend.profile.headline = body.headline;
      backend.profile.summary = body.summary;
      backend.profile.skills = body.skills;
      return json(backend.profile);
    }
    if (path.endsWith("/api/v1/users/me/preferences") && method === "PUT") {
      backend.puts.push({ path, body });
      backend.profile.preferences = body;
      return json(backend.profile);
    }
    return json({ detail: `unhandled ${method} ${path}` }, 404);
  }));

  return backend;
}

function renderSettings() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ToastProvider>
          <Settings />
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("Settings profile save round-trip", () => {
  beforeEach(() => {
    localStorage.setItem("hw_access", "test-access-token");
    localStorage.setItem("hw_refresh", "test-refresh-token");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("persists profile + preferences and reloads them from the backend", async () => {
    const backend = installFakeBackend();
    const user = userEvent.setup();

    const { unmount } = renderSettings();

    // Fields start empty (fresh profile from the backend).
    const headline = await screen.findByLabelText("Headline");
    await waitFor(() => expect(headline).toHaveValue(""));

    // Fill the whole form.
    await user.type(headline, "Senior Product Designer");
    await user.type(screen.getByLabelText("Summary"), "8 years designing payments and fintech products.");
    await user.type(screen.getByLabelText("Skills (comma-separated)"), "Figma, Design Systems, Accessibility");
    await user.type(screen.getByLabelText("Target roles (comma-separated)"), "Senior Product Designer, Design Lead");
    await user.selectOptions(screen.getByLabelText("Seniority"), "senior");
    await user.type(screen.getByLabelText("Salary min (USD)"), "160000");
    await user.type(screen.getByLabelText("Salary max (USD)"), "210000");
    await user.click(screen.getByLabelText("Open to remote roles")); // true -> false

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    // Both PUTs fired with correctly-typed payloads (lists parsed, salary numeric).
    await waitFor(() => expect(backend.puts).toHaveLength(2));
    const profilePut = backend.puts.find((p) => p.path.endsWith("/users/me"))!.body as Profile;
    const prefsPut = backend.puts.find((p) => p.path.endsWith("/preferences"))!.body as Prefs;

    expect(profilePut.headline).toBe("Senior Product Designer");
    expect(profilePut.summary).toBe("8 years designing payments and fintech products.");
    expect(profilePut.skills).toEqual(["Figma", "Design Systems", "Accessibility"]);
    expect(prefsPut.seniority).toBe("senior");
    expect(prefsPut.target_roles).toEqual(["Senior Product Designer", "Design Lead"]);
    expect(prefsPut.remote_ok).toBe(false);
    expect(prefsPut.salary_range).toEqual({ currency: "USD", minimum: 160000, maximum: 210000 });

    // Simulate a reload: a fresh mount must hydrate from the persisted backend.
    unmount();
    renderSettings();

    const reHeadline = await screen.findByLabelText("Headline");
    await waitFor(() => expect(reHeadline).toHaveValue("Senior Product Designer"));
    expect(screen.getByLabelText("Summary")).toHaveValue("8 years designing payments and fintech products.");
    expect(screen.getByLabelText("Skills (comma-separated)")).toHaveValue("Figma, Design Systems, Accessibility");
    expect(screen.getByLabelText("Target roles (comma-separated)")).toHaveValue("Senior Product Designer, Design Lead");
    expect(screen.getByLabelText("Seniority")).toHaveValue("senior");
    expect(screen.getByLabelText("Salary min (USD)")).toHaveValue(160000);
    expect(screen.getByLabelText("Salary max (USD)")).toHaveValue(210000);
    expect(screen.getByLabelText("Open to remote roles")).not.toBeChecked();
  });
});
