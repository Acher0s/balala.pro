"use client";

import { useState } from "react";
import { createKey, revokeKey } from "@/app/studio/admin/api-keys/actions";
import {
  ErrorText,
  field,
  primaryButton,
  secondaryButton,
  useAction,
} from "@/components/studio/forms";
import { API_SCOPES } from "@/lib/seed-lookups-shared";

/** Makes an API key; the key is shown once, right after. */
export function NewApiKeyForm() {
  const { pending, error, run } = useAction();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["seed-reader:read"]);
  const [key, setKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-fd-card p-4">
      <label className="flex flex-col gap-1 text-sm">
        Name (who or what it's for)
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={field}
          maxLength={80}
        />
      </label>
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="mb-1">What it may do</legend>
        {Object.entries(API_SCOPES).map(([scope, label]) => (
          <label key={scope} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={scopes.includes(scope)}
              onChange={(e) =>
                setScopes((prev) =>
                  e.target.checked
                    ? [...prev, scope]
                    : prev.filter((s) => s !== scope),
                )
              }
            />
            <code className="text-xs">{scope}</code> {label}
          </label>
        ))}
      </fieldset>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          className={primaryButton}
          onClick={() =>
            run(async () => {
              const res = await createKey(name, scopes);
              if (res.ok && res.key) {
                setKey(res.key);
                setCopied(false);
                setName("");
              }
              return res;
            })
          }
        >
          Make key
        </button>
        <ErrorText error={error} />
      </div>
      {key && (
        <div className="flex flex-col gap-2 rounded-lg border border-[#ff9a00] bg-[#ff9a00]/10 p-3 text-sm">
          <p className="font-semibold">
            Copy this key now: it won't be shown again.
          </p>
          <code className="break-all rounded bg-fd-background p-2 text-xs">
            {key}
          </code>
          <div className="flex gap-2">
            <button
              type="button"
              className={secondaryButton}
              onClick={() => {
                navigator.clipboard?.writeText(key).then(() => setCopied(true));
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              className={secondaryButton}
              onClick={() => setKey(null)}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function RevokeKeyButton({ id }: { id: string }) {
  const { pending, error, run } = useAction();
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className={secondaryButton}
        onClick={() => {
          if (confirm("Revoke this key? Anything using it stops working."))
            run(() => revokeKey(id));
        }}
      >
        Revoke
      </button>
      <ErrorText error={error} />
    </span>
  );
}
