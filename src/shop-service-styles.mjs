/**
 * Shared accessible visual vocabulary for the Shop's original Market readers.
 * No framework, client script, browser state, extra source read or action.
 * TUFTE remains the upstream presentation engine; these native pre-release
 * pages use one lightweight set of tokens until its carrier is received.
 */
export const SHOP_SERVICE_STYLES = [
  ':root{color-scheme:light dark;--shop-ink:#182c32;--shop-surface:#fafbf9;--shop-panel:#f0f4f2;--shop-line:#b9c9c5;--shop-link:#124f6e;--shop-focus:#b35400}',
  'body{color:var(--shop-ink);background:var(--shop-surface);font-family:system-ui,sans-serif;line-height:1.55}',
  'a{color:var(--shop-link);text-underline-offset:.16em}',
  'a:hover{text-decoration-thickness:.12em}',
  ':where(a,button,input,select,summary):focus-visible{outline:3px solid var(--shop-focus);outline-offset:3px}',
  ':where(button,input,select){font:inherit;min-height:44px}',
  'button{background:var(--shop-panel);color:var(--shop-ink);border:1px solid var(--shop-line);border-radius:.3rem;padding:.45rem .8rem;cursor:pointer}',
  'button:disabled{opacity:.65;cursor:not-allowed}',
  'input{color:var(--shop-ink);background:var(--shop-surface);border:1px solid var(--shop-line);border-radius:.25rem}',
  'table{font-variant-numeric:tabular-nums}',
  'th{background:var(--shop-panel)}',
  'tr:focus-within{outline:2px solid var(--shop-focus);outline-offset:-2px}',
  'fieldset,details,section{min-width:0}',
  'fieldset{border:1px solid var(--shop-line);border-radius:.4rem;padding:.75rem 1rem}',
  'form{max-width:75rem}',
  'code,pre{overflow-wrap:anywhere}',
  '[role=region][tabindex]{overscroll-behavior-inline:contain;scrollbar-gutter:stable}',
  '@media(max-width:640px){body{padding:.75rem}nav{line-height:2}input{max-width:100%}table{font-size:.88rem}th,td{padding:.4rem}}',
  '@media(prefers-color-scheme:dark){:root{--shop-ink:#e6f2ed;--shop-surface:#112022;--shop-panel:#1c3335;--shop-line:#627f7d;--shop-link:#8ed4f5;--shop-focus:#ffbc69}}',
  '@media(forced-colors:active){:where(a,button,input,select,summary):focus-visible{outline:3px solid Highlight}table,th,td,fieldset{border-color:CanvasText}}',
  '@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}',
].join("\n");
