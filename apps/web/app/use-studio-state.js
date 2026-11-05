"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createStudioState } from "../lib/studio-state.mjs";
import { createStudioStorage } from "../lib/studio-storage.mjs";

export function useStudioState({ userId, projectId }) {
  const [state, setState] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const active = useRef(null),
    repo = useRef(null);
  useEffect(() => {
    const record = {
      state: null,
      pending: null,
      storedRevision: null,
      saving: null,
      repo: null,
    };
    active.current = record;
    setLoading(true);
    setState(null);
    setError("");
    try {
      record.repo = createStudioStorage({ indexedDB: window.indexedDB });
    } catch {}
    repo.current = record.repo;
    const load = record.repo
      ? record.repo.load({ userId, projectId })
      : Promise.resolve(null);
    load
      .then((saved) => {
        if (active.current !== record) return;
        const value = saved ?? createStudioState({ userId, projectId });
        record.state = value;
        record.storedRevision = saved?.revision ?? null;
        setState(value);
        setLoading(false);
        if (!record.repo)
          setError(
            "Armazenamento local indisponível. O trabalho ficará somente em memória.",
          );
      })
      .catch(() => {
        if (active.current !== record) return;
        const value = createStudioState({ userId, projectId });
        record.state = value;
        setState(value);
        setLoading(false);
        setError(
          "Não foi possível abrir o trabalho local. Evite fechar esta aba.",
        );
      });
    return () => {
      if (active.current === record) active.current = null;
      Promise.resolve(record.saving)
        .catch(() => {})
        .finally(() => record.repo?.close());
    };
  }, [userId, projectId]);
  const flush = useCallback(async () => {
    const record = active.current;
    if (!record) throw Error("local_storage_unavailable");
    if (record.saving) return record.saving;
    record.saving = (async () => {
      if (!record.repo) throw Error("local_storage_unavailable");
      while (record.pending) {
        const snapshot = record.pending;
        record.pending = null;
        try {
          await record.repo.save(snapshot, {
            expectedRevision: record.storedRevision,
          });
          record.storedRevision = snapshot.revision;
        } catch (e) {
          if (active.current === record) {
            record.pending = record.pending ?? snapshot;
            setError(
              "Não foi possível preservar as alterações. Outra aba pode ter atualizado o projeto; seu trabalho continua nesta aba.",
            );
          }
          throw e;
        }
      }
    })();
    try {
      await record.saving;
    } finally {
      record.saving = null;
    }
  }, []);
  const change = useCallback(
    (reducer) => {
      const record = active.current;
      if (!record?.state) return null;
      const next = reducer(record.state);
      record.state = next;
      record.pending = next;
      setState(next);
      flush().catch(() => {});
      return next;
    },
    [flush],
  );
  const get = useCallback(() => active.current?.state ?? null, []);
  return { state, error, loading, change, get, flush, storage: repo };
}
