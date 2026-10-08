import sanitizeHtml from "sanitize-html";

const MAX_BYTES = 512 * 1024;

export class InvestorSummaryTooLargeError extends Error {
  constructor() {
    super("INVESTOR_SUMMARY_TOO_LARGE");
    this.name = "InvestorSummaryTooLargeError";
  }
}

/**
 * Strips scripts and unsafe markup while keeping common rich-text constructs
 * (lists, tables, links, images, embedded video hosts).
 */
export function sanitizeInvestorSummaryHtml(raw: string): string {
  const s = typeof raw === "string" ? raw : String(raw ?? "");
  if (s.length > MAX_BYTES) {
    throw new InvestorSummaryTooLargeError();
  }
  return sanitizeHtml(s, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "strike",
      "span",
      "div",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "li",
      "blockquote",
      "pre",
      "code",
      "a",
      "img",
      "table",
      "thead",
      "tbody",
      "tfoot",
      "tr",
      "th",
      "td",
      "iframe",
    ],
    allowedAttributes: {
      a: ["href", "name", "target", "rel", "class"],
      img: ["src", "alt", "width", "height", "style", "class"],
      td: ["colspan", "rowspan", "style", "class"],
      th: ["colspan", "rowspan", "style", "class"],
      table: ["style", "class"],
      iframe: [
        "src",
        "width",
        "height",
        "allow",
        "allowfullscreen",
        "frameborder",
        "title",
        "class",
      ],
      "*": ["style", "class"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: {
      img: ["http", "https", "data"],
    },
    allowedIframeHostnames: [
      "www.youtube.com",
      "youtube.com",
      "www.youtube-nocookie.com",
      "player.vimeo.com",
    ],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer",
        target: "_blank",
      }),
    },
  });
}
