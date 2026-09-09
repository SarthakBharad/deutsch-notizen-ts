/**
 * A small XML reader, build-time only.
 *
 * ODF content is mixed content: a paragraph holds text, then a <text:span>,
 * then more text after it. That trailing text is as much part of the sentence
 * as the rest, so the model here keeps `text` (before the first child) and
 * `tail` (after this element, inside its parent) the way ElementTree does.
 * Most XML-to-JSON libraries throw tails away, which silently drops words out
 * of the middle of sentences.
 *
 * `content.xml` is machine-written by LibreOffice, so this handles what that
 * actually emits — declarations, comments, CDATA, self-closing tags, both
 * quote styles, and the five named entities plus numeric ones — and no more.
 */

export interface XmlElement {
  tag: string;
  attrs: Record<string, string>;
  text: string;
  tail: string;
  children: XmlElement[];
}

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

export function decodeEntities(input: string): string {
  if (!input.includes("&")) return input;
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED[body] ?? whole;
  });
}

export function parseXml(source: string): XmlElement {
  let at = 0;
  const stack: XmlElement[] = [];
  let root: XmlElement | null = null;

  const push = (chunk: string) => {
    if (!chunk) return;
    const node = stack[stack.length - 1];
    if (!node) return; // text outside the root element
    const decoded = decodeEntities(chunk);
    if (node.children.length === 0) node.text += decoded;
    else node.children[node.children.length - 1].tail += decoded;
  };

  while (at < source.length) {
    const open = source.indexOf("<", at);
    if (open < 0) {
      push(source.slice(at));
      break;
    }
    push(source.slice(at, open));

    // <?xml ... ?> and <!DOCTYPE ...>
    if (source.startsWith("<?", open)) {
      at = skipPast(source, open, "?>");
      continue;
    }
    if (source.startsWith("<!--", open)) {
      at = skipPast(source, open, "-->");
      continue;
    }
    if (source.startsWith("<![CDATA[", open)) {
      const end = source.indexOf("]]>", open);
      const stop = end < 0 ? source.length : end;
      const node = stack[stack.length - 1];
      if (node) {
        const raw = source.slice(open + 9, stop);
        if (node.children.length === 0) node.text += raw;
        else node.children[node.children.length - 1].tail += raw;
      }
      at = end < 0 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith("<!", open)) {
      at = skipPast(source, open, ">");
      continue;
    }

    const close = findTagEnd(source, open);
    const raw = source.slice(open + 1, close);
    at = close + 1;

    if (raw.startsWith("/")) {
      const done = stack.pop();
      if (done && stack.length === 0) root = done;
      continue;
    }

    const selfClosing = raw.endsWith("/");
    const body = selfClosing ? raw.slice(0, -1) : raw;
    const element = readTag(body);

    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(element);

    if (selfClosing) {
      if (!parent && !root) root = element;
    } else {
      stack.push(element);
    }
  }

  if (!root) root = stack[0] ?? empty("");
  return root;
}

function empty(tag: string): XmlElement {
  return { tag, attrs: {}, text: "", tail: "", children: [] };
}

function skipPast(source: string, from: number, marker: string): number {
  const found = source.indexOf(marker, from);
  return found < 0 ? source.length : found + marker.length;
}

/** Find the `>` closing a tag, ignoring any inside quoted attribute values. */
function findTagEnd(source: string, from: number): number {
  let quote: string | null = null;
  for (let i = from + 1; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ">") {
      return i;
    }
  }
  return source.length;
}

const ATTR = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

function readTag(body: string): XmlElement {
  const match = /^([^\s/>]+)/.exec(body);
  const element = empty(match ? match[1] : body.trim());

  ATTR.lastIndex = match ? match[1].length : 0;
  let attr: RegExpExecArray | null;
  while ((attr = ATTR.exec(body)) !== null) {
    element.attrs[attr[1]] = decodeEntities(attr[3] ?? attr[4] ?? "");
  }
  return element;
}

/* ------------------------------------------------------------- walking */

/** Every descendant with this tag, in document order (self included). */
export function iter(node: XmlElement, tag: string): XmlElement[] {
  const found: XmlElement[] = [];
  const walk = (current: XmlElement) => {
    if (current.tag === tag) found.push(current);
    for (const child of current.children) walk(child);
  };
  walk(node);
  return found;
}

/** Direct children with this tag. */
export function findAll(node: XmlElement, tag: string): XmlElement[] {
  return node.children.filter((child) => child.tag === tag);
}

export function find(node: XmlElement, tag: string): XmlElement | null {
  return node.children.find((child) => child.tag === tag) ?? null;
}

/** All text under an element, tails included. */
export function textContent(node: XmlElement): string {
  let out = node.text;
  for (const child of node.children) out += textContent(child) + child.tail;
  return out;
}
