let _setLocale: ((locale: string) => void) | null = null;

export function _registerSetLocale(fn: (locale: string) => void): void {
  _setLocale = fn;
}

export function useRouter() {
  return {
    push(href: string) {
      if (!_setLocale) return;
      const locale = href === "/" || href === "" ? "en" : href.replace(/^\//, "");
      _setLocale(locale);
    },
  };
}
