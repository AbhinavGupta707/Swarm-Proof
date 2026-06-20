"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Events } from "@swarmproof/events";

type CreateAuditResponse = {
  ok: boolean;
  data?: { auditId: string };
  error?: { message: string };
};

const personaModes = ["normal", "mobile", "chaos", "accessibility-lite"];

export function AuditForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const demoDefault = searchParams.get("demo") === "1";

  async function createAndRun(form: HTMLFormElement, forceDemo = false) {
    setError("");
    setLoading(true);

    const formData = new FormData(form);
    const modes = formData.getAll("modes").map(String);
    const targetUrl = forceDemo ? "/demo-target" : String(formData.get("targetUrl") ?? "");
    const goal = forceDemo ? "Sign up, create a project, invite a teammate." : String(formData.get("goal") ?? "");
    const demoTarget = forceDemo || targetUrl.trim().startsWith("/demo-target");

    try {
      window.pendo?.track?.(Events.UrlSubmitted, {
        target_kind: demoTarget ? "demo" : "public",
        persona_count: modes.length,
        max_steps: 15
      });

      const createResponse = await fetch("/api/audits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetUrl, goal, modes, maxSteps: 15 })
      });
      const createJson = await createResponse.json() as CreateAuditResponse;
      if (!createJson.ok || !createJson.data?.auditId) {
        throw new Error(createJson.error?.message ?? "Could not create audit.");
      }

      window.pendo?.track?.(Events.AuditCreated, {
        target_kind: demoTarget ? "demo" : "public",
        persona_count: modes.length
      });

      window.pendo?.track?.(Events.PreflightStarted, {
        target_kind: demoTarget ? "demo" : "public",
        persona_count: modes.length
      });

      const preflightResponse = await fetch(`/api/audits/${createJson.data.auditId}/preflight`, { method: "POST" });
      window.pendo?.track?.(Events.PreflightCompleted, {
        target_kind: demoTarget ? "demo" : "public",
        ok: preflightResponse.ok
      });

      const runResponse = await fetch(`/api/audits/${createJson.data.auditId}/run`, { method: "POST" });
      let workerDispatched = false;
      try {
        const runJson = await runResponse.json() as { data?: { dispatched?: boolean; provider?: string } };
        workerDispatched = Boolean(runJson.data?.dispatched);
      } catch {
        workerDispatched = false;
      }
      window.pendo?.track?.(Events.AgentRunStarted, {
        target_kind: demoTarget ? "demo" : "public",
        persona_count: modes.length,
        worker_dispatched: workerDispatched
      });

      router.push(`/audits/${createJson.data.auditId}/running`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start audit.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      className="rounded-ui border border-line bg-panel p-5"
      onSubmit={(event) => {
        event.preventDefault();
        void createAndRun(event.currentTarget);
      }}
    >
      <label className="block text-sm font-semibold" htmlFor="targetUrl">
        Product URL
      </label>
      <input
        className="mt-2 min-h-11 w-full rounded-ui border border-line px-3"
        id="targetUrl"
        name="targetUrl"
        placeholder="https://your-product.com"
        defaultValue={demoDefault ? "/demo-target" : ""}
      />
      <label className="mt-5 block text-sm font-semibold" htmlFor="goal">
        User goal
      </label>
      <textarea
        className="mt-2 min-h-28 w-full rounded-ui border border-line px-3 py-2"
        id="goal"
        name="goal"
        defaultValue="Sign up, create a project, invite a teammate."
      />
      <fieldset className="mt-5 grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Personas</legend>
        {personaModes.map((mode) => (
          <label key={mode} className="flex min-h-11 items-center gap-3 rounded-ui border border-line px-3">
            <input defaultChecked={mode !== "accessibility-lite"} name="modes" type="checkbox" value={mode} />
            <span className="capitalize">{mode}</span>
          </label>
        ))}
      </fieldset>
      {error ? <p className="mt-4 rounded-ui border border-crimson/30 bg-crimson/10 p-3 text-sm font-semibold text-crimson">{error}</p> : null}
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          className="inline-flex items-center gap-2 rounded-ui bg-emerald px-5 py-3 font-semibold text-white disabled:opacity-60"
          disabled={loading}
          type="button"
          onClick={(event) => {
            void createAndRun(event.currentTarget.form!, true);
          }}
        >
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {loading ? "Starting..." : "Use built-in demo app"}
        </button>
        <button className="rounded-ui border border-line px-5 py-3 font-semibold disabled:opacity-60" disabled={loading} type="submit">
          {loading ? "Creating..." : "Create audit"}
        </button>
      </div>
    </form>
  );
}
