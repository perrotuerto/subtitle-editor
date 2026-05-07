import { useContext, type ReactNode } from "react";
import { I18nContext } from "../i18n";

type Messages = Record<string, unknown>;

type TFunction = {
  (key: string, params?: Record<string, unknown>): string;
  rich: (key: string, params?: Record<string, unknown>) => string;
};

function getNestedValue(obj: Messages, dotPath: string): string | undefined {
  const parts = dotPath.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === "object" && !Array.isArray(current)) {
      current = (current as Messages)[part];
    } else {
      return undefined;
    }
  }
  return typeof current === "string" ? current : undefined;
}

function resolveMessage(str: string, params?: Record<string, unknown>): string {
  if (!params) return str;

  // ICU plural: {var, plural, =1 {text with #} other {text with #}}
  str = str.replace(
    /\{(\w+),\s*plural,\s*((?:(?:=\d+|\w+)\s*\{[^}]*\}\s*)+)\}/g,
    (_, varName, rulesStr) => {
      const value = Number(params[varName] ?? 0);
      const rulePattern = /(=\d+|\w+)\s*\{([^}]*)\}/g;
      const rules: Array<{ key: string; text: string }> = [];
      let m: RegExpExecArray | null;
      while ((m = rulePattern.exec(rulesStr)) !== null) {
        rules.push({ key: m[1], text: m[2] });
      }
      const exact = rules.find((r) => r.key === `=${value}`);
      if (exact) return exact.text.replace("#", String(value));
      const other = rules.find((r) => r.key === "other");
      return other ? other.text.replace("#", String(value)) : String(value);
    },
  );

  // Simple {variable} interpolation
  str = str.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ""));
  return str;
}

function makeT(messages: Messages, namespace?: string): TFunction {
  const t = (key: string, params?: Record<string, unknown>): string => {
    const fullKey = namespace ? `${namespace}.${key}` : key;
    const raw = getNestedValue(messages, fullKey) ?? fullKey;
    return resolveMessage(raw, params);
  };
  t.rich = (key: string, params?: Record<string, unknown>): string =>
    t(key, params);
  return t;
}

export function useTranslations(namespace?: string): TFunction {
  const { messages } = useContext(I18nContext);
  return makeT(messages, namespace);
}

export function useLocale(): string {
  const { locale } = useContext(I18nContext);
  return locale;
}

export function NextIntlClientProvider({
  children,
}: {
  children: ReactNode;
  messages?: Messages;
  locale?: string;
}) {
  return <>{children}</>;
}
