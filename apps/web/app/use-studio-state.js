"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createStudioState } from "../lib/studio-state.mjs";
import { createStudioStorage } from "../lib/studio-storage.mjs";
import { createStudioStateWriter } from "../lib/studio-state-writer.mjs";

export function useStudioState({ userId, projectId }) {
  const [state, setState] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const active = useRef(null),
    repo = useRef(null);
  useEffect(() => {
    const record = {
      state: null,
      writer: null,
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
    function initialize(value, storedRevision) {
      record.state = value;
      record.writer = createStudioStateWriter({
        repository: record.repo,
        storedRevision,
        onError: () => {
          if (active.current === record)
            setError(
              "Não foi possível preservar as alterações. Outra aba pode ter atualizado o projeto; seu trabalho continua nesta aba.",
            );
        },
      });
      setState(value);
      setLoading(false);
    }
    const ready = load
      .then((saved) => {
        if (active.current !== record) return;
        const value = saved ?? createStudioState({ userId, projectId });
        initialize(value, saved?.revision ?? null);
        if (!record.repo)
          setError(
            "Armazenamento local indisponível. O trabalho ficará somente em memória.",
          );
      })
      .catch(() => {
        if (active.current !== record) return;
        const value = createStudioState({ userId, projectId });
        initialize(value, null);
        setError(
          "Não foi possível abrir o trabalho local. Evite fechar esta aba.",
        );
      });
    return () => {
      if (active.current === record) active.current = null;
      // Finish this record's load/write queue before closing its connection;
      // the next account/project owns a different record and repository.
      ready
        .then(() => record.writer ? record.writer.close() : record.repo?.close())
        .catch(() => {});
    };
  }, [userId, projectId]);
  const flush = useCallback(async () => {
    const record = active.current;
    if (!record?.writer) throw Error("local_storage_unavailable");
    await record.writer.flush();
  }, []);
  const change = useCallback(
    (reducer) => {
      const record = active.current;
      if (!record?.state) return null;
      const next = reducer(record.state);
      record.state = next;
      record.writer.enqueue(next);
      setState(next);
      flush().catch(() => {});
      return next;
    },
    [flush],
  );
  const get = useCallback(() => active.current?.state ?? null, []);
  return { state, error, loading, change, get, flush, storage: repo };
}
