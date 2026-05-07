import React from "react";

interface DynamicOptions {
  ssr?: boolean;
  loading?: () => React.ReactNode;
}

export default function dynamic<T extends React.ComponentType<any>>(
  importFn: () => Promise<any>,
  _options?: DynamicOptions,
): T {
  const LazyComponent = React.lazy(() =>
    importFn().then((mod: any) => ({ default: mod?.default ?? mod })),
  );

  const wrapped = (props: React.ComponentProps<T>) =>
    React.createElement(
      React.Suspense,
      { fallback: null },
      React.createElement(LazyComponent as React.ComponentType<any>, props),
    );

  return wrapped as unknown as T;
}
