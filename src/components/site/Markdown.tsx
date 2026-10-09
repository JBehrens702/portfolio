import ReactMarkdown, { type Components } from "react-markdown";
import { isExternalHref, safeHref, withLinkBase } from "./links";

// The owner's text is a small Markdown subset: paragraphs and links only (KTD5).
// Every other element is unwrapped to its text. Raw HTML is never parsed as
// HTML: react-markdown turns it into plain text (no rehype-raw, no skipHtml).
// A CommonMark autolink such as <https://example.com> is a link, not HTML.

const ALLOWED_ELEMENTS = ["p", "a"];

function urlTransform(url: string): string {
  return safeHref(url) ?? "";
}

function linkComponents(linkBase: string): Components {
  return {
    a({ href, children }) {
      const safe = href ? safeHref(href) : null;
      if (!safe) return <>{children}</>;
      // External links open in a new tab, safely; site links stay in this tab.
      if (isExternalHref(safe)) {
        return (
          <a href={safe} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        );
      }
      return <a href={withLinkBase(safe, linkBase)}>{children}</a>;
    },
  };
}

export interface MarkdownProps {
  text: string;
  className?: string;
  /** "/" for the public site, "/preview" for the preview: site paths in the text stay under it. */
  linkBase?: string;
}

export function Markdown({ text, className, linkBase = "/" }: MarkdownProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        allowedElements={ALLOWED_ELEMENTS}
        unwrapDisallowed
        components={linkComponents(linkBase)}
        urlTransform={urlTransform}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export default Markdown;
