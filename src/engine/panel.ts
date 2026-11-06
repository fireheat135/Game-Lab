// Parameter panel: one input per ParamDef row, grouped. "Apply" rewrites the URL query and reloads.
// Built with createElement/textContent only (no innerHTML), so nothing from the URL is parsed as HTML.
import { toQuery, type ParamDef, type Params } from "./params";

function el(tag: string, props: Record<string, string | number> = {}, ...children: (Node | string)[]): HTMLElement {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

export interface PanelOptions { keep?: string[] } // query keys to carry over untouched (e.g. "test")

export function mountParamPanel<K extends string>(root: HTMLElement, table: readonly ParamDef<K>[], current: Params<K>, opts: PanelOptions = {}) {
  const inputs = new Map<K, HTMLInputElement>();
  const apply = () => {
    const next = { ...current } as Record<K, number>;
    for (const [key, input] of inputs) { const n = Number(input.value); if (input.value.trim() !== "" && Number.isFinite(n)) next[key] = n; }
    const query = new URLSearchParams(toQuery(table, next));
    const old = new URLSearchParams(location.search);
    for (const k of opts.keep ?? []) if (old.has(k)) query.set(k, old.get(k)!);
    location.search = query.toString();
  };

  const table_ = el("table");
  let group = "";
  for (const d of table) {
    if (d.group !== group) { group = d.group; table_.append(el("tr", {}, el("th", { colSpan: 3 }, group))); }
    const shown = String(current[d.key]);
    const input = Object.assign(document.createElement("input"), { name: d.key, value: shown, inputMode: "decimal", title: `${d.label}（初期値 ${d.def}、${d.min}〜${d.max}）` });
    input.addEventListener("input", () => input.classList.toggle("changed", input.value !== shown));
    input.addEventListener("keydown", e => { if (e.key === "Enter") apply(); });
    inputs.set(d.key, input);
    table_.append(el("tr", {}, el("td", { className: "key" }, d.key), el("td", {}, input), el("td", { className: "label" }, d.label, el("span", { className: "def" }, ` 初期 ${d.def}`))));
  }

  const applyButton = el("button", { type: "button" }, "適用して再読み込み");
  applyButton.addEventListener("click", apply);
  const reset = el("a", { href: location.pathname }, "すべて初期値に戻す");
  root.replaceChildren(
    el("div", { className: "query" }, "現在のクエリ: ", el("code", { id: "query" }, location.search || "（なし＝初期値）")),
    el("div", { className: "row" }, applyButton, reset),
    table_,
  );
}
