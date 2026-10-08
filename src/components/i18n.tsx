"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { translate, type Lang, type MessageKey } from "@/lib/i18n/messages";

const KEY = "lw_lang";

type I18nValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
};

let current: Lang = "ru";
let loaded = false;
const listeners = new Set<() => void>();

function readLang(): Lang {
  const stored = localStorage.getItem(KEY);
  return stored === "en" || stored === "he" || stored === "ru" ? stored : "ru";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Lang {
  if (!loaded) {
    current = readLang();
    loaded = true;
  }
  return current;
}

function getServerSnapshot(): Lang {
  return "ru";
}

function applyDocument(lang: Lang) {
  document.documentElement.lang = lang === "he" ? "he" : lang;
  document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
}

const I18nContext = createContext<I18nValue>({
  lang: "ru",
  setLang: () => undefined,
  t: (key, vars) => translate("ru", key, vars),
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    applyDocument(lang);
  }, [lang]);

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      setLang: (next) => {
        current = next;
        localStorage.setItem(KEY, next);
        applyDocument(next);
        listeners.forEach((listener) => listener());
      },
      t: (key, vars) => translate(lang, key, vars),
    }),
    [lang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
