"use client";

import { useEffect, useRef, useState } from "react";
import { parseSessionState } from "../lib/session-state";
import { useAICredentials } from "./use-ai-credentials";
import { syncReferenceConsentAccount } from "../lib/reference-session-consent";
import dynamic from "next/dynamic";
import BrandSymbol from "./brand-symbol";
import { brandImages, entryCopy, entryDraftStorage } from "../lib/entry-content";
import "./entry.css";
import "./studio-shell.css";

const StudioApp = dynamic(() => import("./studio-app"), {
  loading: () => <p role="status">Abrindo sua conversa…</p>,
});
export default function Workspace({ loginAvailable, localAuth = false, developerMode = false, parallelAvailable = false, selectedVisualsAvailable = false, selectedVisualsRequired = false }: { loginAvailable: boolean; localAuth?: boolean; developerMode?: boolean; parallelAvailable?:boolean;selectedVisualsAvailable?:boolean;selectedVisualsRequired?:boolean }) {
  const [objective, setObjective] = useState("");
  const [authState, setAuthState] = useState("checking");
  const [authenticatedUser, setAuthenticatedUser] = useState<string | null>(null);
  const [account, setAccount] = useState<{label:string;local:boolean}|null>(null);
  const [signOutError, setSignOutError] = useState(false);
  const sessionEpoch = useRef(0);
  const lastConnectedUser = useRef<string | null>(null);
  const signingOut = useRef(false);
  const credentials = useAICredentials(authenticatedUser, authState === "connected");
  const clearOpenAIKey = credentials.clear;
  const draftKey = useRef<string | null>(null);
  const memoryDrafts = useRef(new Map<string, string>());
  const activeIdentity = useRef<string | null>(null);
  const pendingKey = useRef<string | null>(null);
  const [loginError, setLoginError] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [hasPendingDraft, setHasPendingDraft] = useState(false);
  useEffect(() => {
    const clearOnExit = () => clearOpenAIKey();
    window.addEventListener("pagehide", clearOnExit);
    return () => {
      window.removeEventListener("pagehide", clearOnExit);
    };
  }, []);
  useEffect(() => {
    setLoginError(
      new URLSearchParams(window.location.search).get("login") === "erro",
    );
    if (!loginAvailable) {
      clearOpenAIKey();
      setAuthenticatedUser(null);
      activeIdentity.current = "offline";
      setAuthState("offline");
      return;
    }
    // Invalidate stale session reads by generation/epoch; cancelling their
    // browser response can surface AbortError during focus or effect cleanup.
    let generation = 0;
    const checkSession = () => {
      if (signingOut.current) return;
      const currentGeneration = ++generation;
      const currentEpoch = ++sessionEpoch.current;
      draftKey.current = null;
      activeIdentity.current = null;
      pendingKey.current = null;
      setHasPendingDraft(false);
      setObjective("");
      setAuthState("checking");
      fetch("/auth/session", { cache: "no-store" })
        .then((response) =>
          response.ok ? response.json() : { state: "unavailable" },
        )
        .then((input: unknown) => {
          const data = parseSessionState(input);
          if (currentGeneration !== generation || currentEpoch !== sessionEpoch.current) return;
          if (
            data.state === "connected" &&
            typeof data.userId === "string" &&
            data.userId
          ) {
            try { syncReferenceConsentAccount(sessionStorage,data.userId); } catch {}
            // Another account must not inherit the open project/post from the address bar.
            if (lastConnectedUser.current && lastConnectedUser.current !== data.userId && window.location.pathname !== "/") window.history.replaceState(null, "", "/");
            lastConnectedUser.current = data.userId;
            setAuthenticatedUser(data.userId);
            setAccount(data.account ?? {label:"Conta conectada",local:localAuth});
            setSignOutError(false);
            const identity = `user:${data.userId}`;
            activeIdentity.current = identity;
            try {
              const key = `compor-objective:user:${data.userId}`;
              const seenAccount =
                sessionStorage.getItem(entryDraftStorage.seenAccount) === "1";
              const claimSource = sessionStorage.getItem(
                entryDraftStorage.claimPending,
              );
              const claim =
                claimSource === "anonymous" ||
                (claimSource === "guest" && !seenAccount);
              const sourceKey = claim
                ? entryDraftStorage.draft[claimSource]
                : null;
              const existing = sessionStorage.getItem(key);
              const guest = sourceKey
                ? sessionStorage.getItem(sourceKey)
                : null;
              if (claim && existing === null && guest !== null)
                sessionStorage.setItem(key, guest);
              const pending = `compor-objective:pending:${data.userId}`;
              if (
                claim &&
                existing !== null &&
                guest !== null &&
                existing !== guest
              ) {
                const previous = sessionStorage.getItem(pending);
                if (previous !== null && previous !== guest)
                  sessionStorage.setItem(
                    `${pending}:archive:${crypto.randomUUID()}`,
                    previous,
                  );
                sessionStorage.setItem(pending, guest);
              }
              sessionStorage.setItem(entryDraftStorage.seenAccount, "1");
              if (claimSource === "anonymous" && claim && sourceKey)
                sessionStorage.removeItem(sourceKey);
              sessionStorage.removeItem(entryDraftStorage.claimPending);
              draftKey.current = key;
              pendingKey.current = pending;
              setHasPendingDraft(sessionStorage.getItem(pending) !== null);
              setObjective(
                memoryDrafts.current.get(identity) ?? existing ?? guest ?? "",
              );
            } catch {
              draftKey.current = null;
              setObjective(memoryDrafts.current.get(identity) ?? "");
            }
            setAuthState("connected");
          } else if (data.state === "signed-out") {
            try { syncReferenceConsentAccount(sessionStorage,null); } catch {}
            clearOpenAIKey();
            setAuthenticatedUser(null);
            setAccount(null);
            try {
              sessionStorage.removeItem(entryDraftStorage.claimPending);
              const seenAccount =
                sessionStorage.getItem(entryDraftStorage.seenAccount) === "1";
              draftKey.current = seenAccount
                ? entryDraftStorage.draft.anonymous
                : entryDraftStorage.draft.guest;
              activeIdentity.current = seenAccount ? "signed-out" : "guest";
              setObjective(
                memoryDrafts.current.get(activeIdentity.current) ??
                  (draftKey.current
                    ? sessionStorage.getItem(draftKey.current) || ""
                    : ""),
              );
            } catch {
              draftKey.current = null;
              activeIdentity.current = "signed-out";
              setObjective(memoryDrafts.current.get("signed-out") ?? "");
            }
            setAuthState("signed-out");
          } else {
            clearOpenAIKey();
            setAuthenticatedUser(null);
            setAccount(null);
            draftKey.current = null;
            setObjective("");
            setAuthState("unavailable");
          }
        })
        .catch((error) => {
          if (currentGeneration === generation && currentEpoch === sessionEpoch.current && !(error instanceof DOMException && error.name === "AbortError")) {
            clearOpenAIKey();
            setAuthenticatedUser(null);
            setAccount(null);
            setAuthState("unavailable");
          }
        });
    };
    const checkVisible = () => {
      if (document.visibilityState === "visible") checkSession();
    };
    checkSession();
    window.addEventListener("focus", checkSession);
    document.addEventListener("visibilitychange", checkVisible);
    return () => {
      generation++;
      sessionEpoch.current++;
      window.removeEventListener("focus", checkSession);
      document.removeEventListener("visibilitychange", checkVisible);
    };
  }, [loginAvailable]);

  const recoverPending = () => {
    try {
      if (!pendingKey.current || !activeIdentity.current) return;
      const pending = sessionStorage.getItem(pendingKey.current);
      if (pending === null || !draftKey.current) return;
      if (objective && objective !== pending)
        sessionStorage.setItem(
          `${draftKey.current}:archive:${crypto.randomUUID()}`,
          objective,
        );
      sessionStorage.setItem(draftKey.current, pending);
      sessionStorage.removeItem(pendingKey.current);
      memoryDrafts.current.set(activeIdentity.current, pending);
      setObjective(pending);
      setHasPendingDraft(false);
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  };
  const signOut = async () => {
    if(signingOut.current)return;
    signingOut.current=true;
    sessionEpoch.current++;
    activeIdentity.current=null;
    try { syncReferenceConsentAccount(sessionStorage,null); } catch {}
    clearOpenAIKey();
    setAuthState("checking");
    try {
      const response=await fetch('/auth/sign-out',{method:'POST',cache:'no-store'});
      const result:unknown=await response.json();
      if(!response.ok || parseSessionState(result).state!=='signed-out')throw Error('sign_out_unavailable');
      setAuthenticatedUser(null);
      setAccount(null);
      setObjective("");
      setSignOutError(false);
      setAuthState("signed-out");
    } catch {
      setAuthenticatedUser(null);
      setAccount(null);
      setObjective("");
      setSignOutError(true);
      setAuthState("unavailable");
    } finally { signingOut.current=false; }
  };
  if (authenticatedUser && ["connected", "checking"].includes(authState))
    return (
      <>
        {authState === "checking" && (
          <p role="status">Verificando sua conta…</p>
        )}
        <div
          hidden={authState !== "connected"}
          inert={authState !== "connected"}
          data-testid="studio-auth-boundary"
        >
          <StudioApp
            developerMode={developerMode}
            parallelAvailable={parallelAvailable}
            selectedVisualsAvailable={selectedVisualsAvailable}
            selectedVisualsRequired={selectedVisualsRequired}
            key={authenticatedUser}
            userId={authenticatedUser}
            accountLabel={account?.label ?? "Conta conectada"}
            localAccount={account?.local ?? localAuth}
            onSignOut={signOut}
            initialObjective={objective}
            isAuthenticated={() =>
              activeIdentity.current === `user:${authenticatedUser}`
            }
            hasApiKey={credentials.hasApiKey}
            canUseAI={credentials.canUseAI}
            credentialSource={credentials.source}
            credentialEpoch={credentials.epoch}
            defaultAvailable={credentials.defaultAvailable}
            onUseAI={credentials.useAI}
            onPauseAI={credentials.pauseAI}
            getApiKey={credentials.getApiKey}
            onRemoveKey={credentials.useDefault}
            recoveryBanner={
              hasPendingDraft ? (
                <div role="status">
                  <p>Há um rascunho anterior preservado neste navegador.</p>
                  <button onClick={recoverPending}>
                    Recuperar rascunho anterior
                  </button>
                </div>
              ) : null
            }
            keyInput={credentials.keyInput}
          />
        </div>
      </>
    );
  return (
    <main className="compor-entry" aria-labelledby="entry-title">
      <div className="entry-content">
        <div className="entry-brand" aria-label="Compor">
          <BrandSymbol motion={authState === "checking" ? "working" : "arriving"} />
          <img src={brandImages.wordmark.src} alt={brandImages.wordmark.alt} width={brandImages.wordmark.width} height={brandImages.wordmark.height} />
        </div>
        <section className="entry-panel" aria-labelledby="entry-title">
          <h1 id="entry-title">{entryCopy.title}</h1>
          <p className="entry-description">{entryCopy.description}</p>
          <form
            action="/auth/sign-in"
            method="post"
            onSubmit={(event) => {
              try {
                if (draftKey.current) {
                  sessionStorage.setItem(draftKey.current, objective);
                  sessionStorage.setItem(
                    entryDraftStorage.claimPending,
                    draftKey.current === entryDraftStorage.draft.guest
                      ? "guest"
                      : "anonymous",
                  );
                } else if (objective) throw Error();
              } catch {
                if (objective) {
                  event.preventDefault();
                  setStorageError(true);
                }
              }
            }}
          >
            <button
              className="entry-google"
              disabled={
                !loginAvailable ||
                authState === "unavailable" ||
                authState === "checking"
              }
            >
              {localAuth ? "Entrar no ambiente local" : entryCopy.googleButton}
            </button>
          </form>
          <p className="entry-note">{localAuth ? "Sessão anônima de desenvolvimento no banco local." : entryCopy.googleNote}</p>
          {authState === "checking" && (
            <p className="entry-status" role="status">Verificando sua conta…</p>
          )}
          {(authState === "unavailable" || authState === "offline") && (
            <p className="entry-alert" role="status">{signOutError ? "Não foi possível confirmar a saída. Tente novamente." : "Login temporariamente indisponível."}</p>
          )}
          {authState === "unavailable" && (
            <button className="entry-retry" type="button" onClick={() => window.location.reload()}>
              Tentar novamente
            </button>
          )}
          {loginError && (
            <p className="entry-alert" role="alert">{entryCopy.loginError}</p>
          )}
          {storageError && (
            <p className="entry-alert" role="alert">{entryCopy.storageError}</p>
          )}
          {objective && (
            <details className="entry-draft" open={storageError}>
              <summary>{entryCopy.draftSummary}</summary>
              <p>{objective}</p>
            </details>
          )}
        </section>
        <p className="entry-byline">{entryCopy.byline}</p>
      </div>
    </main>
  );
}
