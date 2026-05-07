import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import enMessages from "../../messages/en.json";
import deMessages from "../../messages/de.json";
import yueMessages from "../../messages/yue.json";
import { _registerSetLocale } from "./shims/next-navigation";

type Messages = Record<string, unknown>;
type Locale = "en" | "de" | "yue";

const messageMap: Record<Locale, Messages> = {
  en: enMessages as Messages,
  de: deMessages as Messages,
  yue: yueMessages as Messages,
};

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  messages: Messages;
}

export const I18nContext = createContext<I18nContextValue>({
  locale: "en",
  setLocale: () => {},
  messages: enMessages as Messages,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    _registerSetLocale((loc: string) => {
      if (loc === "en" || loc === "de" || loc === "yue") {
        setLocale(loc as Locale);
      }
    });
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.setAttribute("data-locale", locale);
  }, [locale]);

  return (
    <I18nContext.Provider
      value={{ locale, setLocale, messages: messageMap[locale] }}
    >
      {children}
    </I18nContext.Provider>
  );
}

export function useI18nContext() {
  return useContext(I18nContext);
}
