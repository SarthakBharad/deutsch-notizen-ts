"use client";

import { Fragment, type ReactNode } from "react";

import { leadingTint } from "@/lib/inline";
import { bandText, isBand, isEmptyCell } from "@/lib/layout";
import { filterList, type Search } from "@/lib/search";
import type { Block, Cell, ListItem, SheetGroup, Span, TableBlock } from "@/lib/types";

/* ---------------------------------------------------------- highlight */

export function Marked({ text, search }: { text: string; search: Search }) {
  return (
    <>
      {search.segment(text).map((segment, i) =>
        segment.hit ? <mark key={i}>{segment.text}</mark> : <Fragment key={i}>{segment.text}</Fragment>,
      )}
    </>
  );
}

/** Text with newlines turned into breaks — a cell can hold several lines. */
function Lines({ text, search }: { text: string; search: Search }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          <Marked text={line} search={search} />
        </Fragment>
      ))}
    </>
  );
}

function CellBody({ cell, search }: { cell: Cell; search: Search }) {
  const lead = leadingTint(cell.text);

  // Only tint the prefix when the search hasn't already highlighted it, so the
  // two emphases never fight over the same characters.
  if (lead && !search.segment(cell.text)[0]?.hit) {
    return (
      <>
        <span className={lead.kind === "article" ? "art" : "aux"}>{lead.word}</span>
        <Lines text={lead.rest} search={search} />
      </>
    );
  }
  return <Lines text={cell.text} search={search} />;
}

/* -------------------------------------------------------------- tables */

function GridTable({ block, search }: { block: TableBlock; search: Search }) {
  const width = Math.max(
    block.header?.length ?? 0,
    ...block.rows.map((row) => row.length),
    1,
  );

  const pad = (row: Cell[]): Cell[] => [
    ...row,
    ...Array.from({ length: Math.max(0, width - row.length) }, () => ({
      text: "",
      colspan: 1,
      rowspan: 1,
      covered: false,
      bold: false,
    })),
  ];

  // Merges are tracked against a grid rather than trusting each cell's own
  // flag. A "covered" cell whose parent merge lives outside this block — cut
  // off when the sheet was split, or lifted out with the header — has nothing
  // spanning it any more, and skipping it would pull the rest of the row left
  // and invent a column at the far end.
  const occupied = new Map<number, number>();

  const body = block.rows.map((row, index) => {
    if (row.every(isEmptyCell)) {
      occupied.clear();
      return (
        <tr className="spacer" key={index}>
          <td colSpan={width} />
        </tr>
      );
    }

    if (isBand(row)) {
      occupied.clear();
      return (
        <tr className="band" key={index}>
          <td colSpan={width}>
            <Marked text={bandText(row)} search={search} />
          </td>
        </tr>
      );
    }

    const remaining = block.rows.length - index;
    const padded = pad(row);
    const cells: ReactNode[] = [];

    for (let column = 0; column < width; column += 1) {
      const held = occupied.get(column) ?? 0;
      if (held > 0) {
        occupied.set(column, held - 1);
        continue;
      }

      const cell = padded[column];
      if (cell.covered) {
        cells.push(<td key={column} />); // orphaned by a split; hold the column
        continue;
      }

      const colSpan = Math.max(cell.colspan, 1);
      const rowSpan = Math.min(cell.rowspan, remaining);
      if (rowSpan > 1) {
        for (let offset = 0; offset < colSpan; offset += 1) {
          occupied.set(column + offset, rowSpan - 1);
        }
      }
      // A merge only reads as a block label when it says something. Merging a
      // blank region — as these sheets do under für and in — is just tidiness
      // in LibreOffice, and tinting it would put a slab of colour over nothing.
      const isLabel = rowSpan > 1 && !isEmptyCell(cell);

      const className = [column === 0 ? "lead" : "", isLabel ? "rowlabel" : ""]
        .filter(Boolean)
        .join(" ");

      cells.push(
        <td
          key={column}
          className={className || undefined}
          colSpan={colSpan > 1 ? colSpan : undefined}
          rowSpan={rowSpan > 1 ? rowSpan : undefined}
        >
          <CellBody cell={cell} search={search} />
        </td>,
      );
    }

    return <tr key={index}>{cells}</tr>;
  });

  return (
    <div className="tbl-wrap">
      <table className="grid">
        {block.header && (
          <thead>
            <tr>
              {pad(block.header).map((cell, i) => (
                <th key={i}>
                  <Marked text={cell.text} search={search} />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>{body}</tbody>
      </table>
    </div>
  );
}

export function Groups({ groups, search }: { groups: SheetGroup[]; search: Search }) {
  return (
    <>
      {groups.map((group, gi) => (
        <div className="sheet-group" key={gi}>
          {group.blocks.map((block, bi) => (
            <GridTable block={block} search={search} key={bi} />
          ))}
        </div>
      ))}
    </>
  );
}

/* ----------------------------------------------------------- documents */

function Spans({ spans, search }: { spans: Span[]; search: Search }) {
  return (
    <>
      {spans.map((span, i) => {
        let node: ReactNode = <Lines text={span.text} search={search} />;
        if (span.bold) node = <strong>{node}</strong>;
        if (span.italic) node = <em>{node}</em>;
        return <Fragment key={i}>{node}</Fragment>;
      })}
    </>
  );
}

/**
 * Render a flat depth-tagged list as nested <ol>/<ul>.
 *
 * Nested levels get class="beispiel": in these notes an indented sub-item is
 * always an example sentence for the rule above it, and it should read as one.
 */
function NestedList({ items, search }: { items: ListItem[]; search: Search }) {
  const build = (from: number, depth: number): [ReactNode, number] => {
    const nodes: ReactNode[] = [];
    let i = from;

    while (i < items.length && items[i].depth >= depth) {
      if (items[i].depth > depth) {
        const [nested, next] = build(i, items[i].depth);
        const last = nodes.pop();
        nodes.push(
          <Fragment key={`w${i}`}>
            {last}
            {nested}
          </Fragment>,
        );
        i = next;
        continue;
      }
      const item = items[i];
      nodes.push(
        <li key={i}>
          <Spans spans={item.spans} search={search} />
        </li>,
      );
      i += 1;
    }

    const ordered = items[from]?.ordered ?? false;
    const className = depth > 1 ? "beispiel" : undefined;
    const list = ordered ? (
      <ol className={className}>{nodes}</ol>
    ) : (
      <ul className={className}>{nodes}</ul>
    );
    return [list, i];
  };

  if (!items.length) return null;
  return build(0, items[0].depth)[0];
}

export function Document({ blocks, search }: { blocks: Block[]; search: Search }) {
  return (
    <div className="doc">
      {blocks.map((block, i) => {
        if (block.kind === "heading") {
          const Tag = (["h2", "h2", "h3", "h4", "h4"][block.level - 1] ?? "h4") as "h2" | "h3" | "h4";
          return (
            <Tag key={i}>
              <Spans spans={block.spans} search={search} />
            </Tag>
          );
        }
        if (block.kind === "paragraph") {
          return (
            <p key={i}>
              <Spans spans={block.spans} search={search} />
            </p>
          );
        }
        if (block.kind === "list") {
          return <NestedList key={i} items={filterList(block.items, search)} search={search} />;
        }
        return <Groups key={i} groups={block.groups} search={search} />;
      })}
    </div>
  );
}
