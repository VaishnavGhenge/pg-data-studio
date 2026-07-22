// Add/edit data source modal: structured fields two-way synced with a raw
// postgres:// URL field. React's controlled-input model gives the same
// loop-safety the old renderer relied on for free — updating state and
// letting the input re-render with a new value never re-fires onChange, so
// no extra guard flag is needed.

import { useState } from "react";
import { Modal } from "../common/Modal";
import { useSourceActions } from "../../hooks/useSourceActions";
import { useToast } from "../../state/toastStore";
import { unwrap } from "../../hooks/useApi";
import { AlertCircleIcon, CheckCircleIcon, DatabaseModalIcon, CloseIcon } from "../common/icons";

interface FormFields {
  name: string;
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
}

function fieldsFromSource(s: Source | null): FormFields {
  return {
    name: s?.name ?? "",
    host: s?.host ?? "localhost",
    port: String(s?.port ?? 5432),
    user: s?.user ?? "postgres",
    password: s?.password ?? "",
    database: s?.database ?? "",
    ssl: s?.ssl ?? false,
  };
}

function buildUrl(f: FormFields): string {
  const cred = f.user
    ? encodeURIComponent(f.user) + (f.password ? ":" + encodeURIComponent(f.password) : "") + "@"
    : "";
  const port = f.port ? ":" + f.port : "";
  const q = f.ssl ? "?sslmode=require" : "";
  return `postgres://${cred}${f.host}${port}/${encodeURIComponent(f.database)}${q}`;
}

// Masks the password segment of a postgres:// URL for display (the
// dedicated Password field already hides it; the URL field was showing it
// right back in plain text). Only cosmetic — the real password stays in
// component state and is never derived from this masked string.
function maskUrlPassword(raw: string): string {
  return raw.replace(/^(postgres(?:ql)?:\/\/[^:/@]*:)([^@]*)(@)/, (_m, pre, pass, at) =>
    pre + (pass ? "•".repeat(Math.min(pass.length, 10)) : "") + at
  );
}

// Best-effort parse of the URL field back into structured fields; returns
// null (leaving fields untouched) for anything that isn't a postgres URL.
function parseUrl(raw: string): Partial<FormFields> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (!/^postgres(ql)?:$/.test(u.protocol)) return null;
    const out: Partial<FormFields> = { port: u.port || "5432" };
    if (u.hostname) out.host = decodeURIComponent(u.hostname);
    const db = decodeURIComponent(u.pathname.replace(/^\//, ""));
    if (db) out.database = db;
    if (u.username) out.user = decodeURIComponent(u.username);
    if (u.password) out.password = decodeURIComponent(u.password);
    const sslmode = u.searchParams.get("sslmode");
    if (sslmode) out.ssl = sslmode !== "disable";
    return out;
  } catch {
    return null;
  }
}

function validate(f: FormFields): string | null {
  if (!f.host.trim()) return "Host is required.";
  if (!f.database.trim()) return "Database is required.";
  if (!f.user.trim()) return "User is required.";
  return null;
}

function defaultName(f: FormFields): string {
  return `${f.database.trim() || "postgres"} @ ${f.host.trim() || "localhost"}`;
}

function buildSourceForSubmit(id: string | null, f: FormFields): Source {
  const s: Source = {
    id: id ?? "",
    name: f.name.trim(),
    host: f.host.trim(),
    port: Number(f.port) || 5432,
    database: f.database.trim(),
    user: f.user.trim(),
    password: f.password,
    ssl: f.ssl,
  };
  if (!s.name) s.name = defaultName(f);
  return s;
}

interface SourceModalProps {
  open: boolean;
  source: Source | null; // null = "new"
  onClose: () => void;
}

export function SourceModal({ open, source, onClose }: SourceModalProps) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="modalTitle">
      <SourceModalForm source={source} onClose={onClose} />
    </Modal>
  );
}

function SourceModalForm({ source, onClose }: { source: Source | null; onClose: () => void }) {
  const [fields, setFields] = useState<FormFields>(() => fieldsFromSource(source));
  const [url, setUrl] = useState(() => buildUrl(fieldsFromSource(source)));
  const [urlFocused, setUrlFocused] = useState(false);
  const [formError, setFormError] = useState("");
  const [testResult, setTestResult] = useState<{ text: string; ok: boolean } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);

  const { saveSource, connect } = useSourceActions();
  const { show: toast } = useToast();

  function setField<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    const next = { ...fields, [key]: value };
    setFields(next);
    setUrl(buildUrl(next));
  }

  // Parses the URL field into structured fields and normalizes the URL
  // display; returns the resulting fields so a caller in the same event
  // handler (Enter in the URL field) can use them immediately instead of
  // reading the not-yet-applied `fields` state.
  function commitUrl(): FormFields {
    const parsed = parseUrl(url);
    if (!parsed) return fields; // invalid URL — leave fields untouched
    const next = { ...fields, ...parsed };
    setFields(next);
    setUrl(buildUrl(next));
    return next;
  }

  async function handleConnect(f: FormFields = fields) {
    const err = validate(f);
    if (err) return setFormError(err);
    setFormError("");
    setConnecting(true);
    try {
      const saved = await saveSource(buildSourceForSubmit(source?.id ?? null, f));
      onClose();
      await connect(saved);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }

  async function handleSave(f: FormFields = fields) {
    const err = validate(f);
    if (err) return setFormError(err);
    try {
      await saveSource(buildSourceForSubmit(source?.id ?? null, f));
      onClose();
      toast("Saved");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleTest() {
    const err = validate(fields);
    if (err) return setFormError(err);
    setFormError("");
    setTestResult(null);
    setTesting(true);
    try {
      const meta = await unwrap(window.api.testConnection(buildSourceForSubmit(null, fields)));
      setTestResult({ text: meta.serverVersion ?? "connected", ok: true });
    } catch (e) {
      setTestResult({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setTesting(false);
    }
  }

  return (
    <>
      <div className="modal-head">
        <DatabaseModalIcon size={20} />
        <h2 id="modalTitle">{source ? "Edit data source" : "New data source"}</h2>
        <button className="icon-btn" title="Close" aria-label="Close" onClick={onClose}>
          <CloseIcon size={15} />
        </button>
      </div>

      <div className="form-grid">
        <label className="field-label" htmlFor="srcName">
          Name
        </label>
        <input
          className="field"
          id="srcName"
          spellCheck={false}
          autoComplete="off"
          placeholder="My database"
          value={fields.name}
          onChange={(e) => setField("name", e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleConnect()}
          autoFocus
        />

        <div className="form-row">
          <div className="form-col grow">
            <label className="field-label" htmlFor="srcHost">
              Host
            </label>
            <input
              className="field"
              id="srcHost"
              spellCheck={false}
              autoComplete="off"
              placeholder="localhost"
              value={fields.host}
              onChange={(e) => setField("host", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
            />
          </div>
          <div className="form-col port">
            <label className="field-label" htmlFor="srcPort">
              Port
            </label>
            <input
              className="field"
              id="srcPort"
              type="number"
              inputMode="numeric"
              placeholder="5432"
              value={fields.port}
              onChange={(e) => setField("port", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-col grow">
            <label className="field-label" htmlFor="srcUser">
              User
            </label>
            <input
              className="field"
              id="srcUser"
              spellCheck={false}
              autoComplete="off"
              placeholder="postgres"
              value={fields.user}
              onChange={(e) => setField("user", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
            />
          </div>
          <div className="form-col grow">
            <label className="field-label" htmlFor="srcPassword">
              Password
            </label>
            <input
              className="field"
              id="srcPassword"
              type="password"
              autoComplete="off"
              placeholder="••••••••"
              value={fields.password}
              onChange={(e) => setField("password", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
            />
          </div>
        </div>

        <label className="field-label" htmlFor="srcDatabase">
          Database
        </label>
        <input
          className="field"
          id="srcDatabase"
          spellCheck={false}
          autoComplete="off"
          placeholder="postgres"
          value={fields.database}
          onChange={(e) => setField("database", e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleConnect()}
        />

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={fields.ssl}
            onChange={(e) => setField("ssl", e.target.checked)}
          />{" "}
          <span>Use SSL</span>
        </label>

        <div className="url-divider">or paste a URL</div>
        <input
          className="field url"
          id="srcUrl"
          spellCheck={false}
          autoComplete="off"
          aria-label="Connection URL — fills the fields above"
          placeholder="postgres://user:password@localhost:5432/dbname"
          value={urlFocused ? url : maskUrlPassword(url)}
          onChange={(e) => setUrl(e.target.value)}
          onFocus={() => setUrlFocused(true)}
          onBlur={() => {
            setUrlFocused(false);
            commitUrl();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleConnect(commitUrl());
          }}
        />
      </div>

      {formError && <div className="connect-error">{formError}</div>}

      <div className="form-actions">
        <span
          className={"test-result" + (testResult ? (testResult.ok ? " ok" : " err") : "")}
          title={testResult?.text}
        >
          {!testing && testResult && (testResult.ok ? <CheckCircleIcon size={12} /> : <AlertCircleIcon size={12} />)}
          {testing ? "Testing…" : (testResult?.text ?? "")}
        </span>
        <span className="spacer" />
        <button className="btn ghost" disabled={testing} onClick={handleTest}>
          {testing ? "Testing…" : "Test"}
        </button>
        <button className="btn ghost" onClick={() => handleSave()}>
          Save
        </button>
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" disabled={connecting} onClick={() => handleConnect()}>
          {connecting ? "Connecting…" : "Connect"}
        </button>
      </div>
      <p className="connect-note">
        Saved locally in plaintext for convenience — same as a <code>.env</code> on your machine.
      </p>
    </>
  );
}
