import { NewApiKeyForm, RevokeKeyButton } from "@/components/studio/api-keys";
import { Panel } from "@/components/studio/forms";
import { listApiKeys } from "@/lib/api-keys";
import { requireUser } from "@/lib/auth";

const when = (d: Date | null) => (d ? d.toLocaleString("en-GB") : "never");

/** Admins make and revoke the site's API keys here. */
export default async function ApiKeysPage() {
  await requireUser("admin", "/studio/admin/api-keys");
  const keys = await listApiKeys();
  const active = keys.filter((k) => !k.key.revokedAt);
  const revoked = keys.filter((k) => k.key.revokedAt);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <div>
        <h1 className="text-2xl font-bold">API keys</h1>
        <p className="text-sm text-fd-muted-foreground">
          Keys for the site's API. Each key only does what it was made for; send
          it as <code>Authorization: Bearer &lt;key&gt;</code>. Only a hash of
          each key is kept, so a lost key can't be shown again: revoke it and
          make a new one.
        </p>
      </div>
      <Panel title="Make a key">
        <NewApiKeyForm />
      </Panel>
      <Panel title={`Keys (${active.length})`}>
        {active.length === 0 && (
          <p className="text-sm text-fd-muted-foreground">No keys yet.</p>
        )}
        <ul className="divide-y rounded-xl border bg-fd-card">
          {active.map(({ key, creator }) => (
            <li
              key={key.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
            >
              <span className="flex flex-col">
                <span className="font-medium">{key.name}</span>
                <span className="text-xs text-fd-muted-foreground">
                  <code>{key.prefix}…</code> · {key.scopes.join(", ")} · made by{" "}
                  {creator ?? "someone"} on {when(key.createdAt)} · last used{" "}
                  {when(key.lastUsedAt)}
                </span>
              </span>
              <RevokeKeyButton id={key.id} />
            </li>
          ))}
        </ul>
      </Panel>
      {revoked.length > 0 && (
        <Panel title={`Revoked (${revoked.length})`}>
          <ul className="divide-y rounded-xl border text-sm text-fd-muted-foreground">
            {revoked.map(({ key }) => (
              <li key={key.id} className="px-4 py-2">
                {key.name} · <code>{key.prefix}…</code> · revoked{" "}
                {when(key.revokedAt)}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </main>
  );
}
