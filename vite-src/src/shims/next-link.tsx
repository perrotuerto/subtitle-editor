import { type AnchorHTMLAttributes, type ReactNode } from "react";
import { useRouter } from "./next-navigation";

const LOCALE_PATHS = new Set(["/", "/de", "/yue"]);

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children?: ReactNode;
}

export default function Link({ href, children, onClick, ...props }: LinkProps) {
  const router = useRouter();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (!e.defaultPrevented) {
      e.preventDefault();
      if (href.startsWith("http://") || href.startsWith("https://")) {
        window.open(href, props.target || "_blank", "noopener,noreferrer");
      } else if (LOCALE_PATHS.has(href)) {
        router.push(href);
      }
      // Other internal paths (e.g. /faq) silently ignored in offline mode
    }
  };

  return (
    <a href={href} onClick={handleClick} {...props}>
      {children}
    </a>
  );
}
