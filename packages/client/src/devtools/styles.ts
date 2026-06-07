// packages/client/src/devtools/styles.ts

export const PANEL_CSS = `
#datum-devtools {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 320px;
  min-height: 120px;
  max-height: 80vh;
  background: #1e1e1e;
  border-top: 2px solid rgba(37,99,235,0.2);
  display: flex;
  flex-direction: column;
  font-family: 'SF Mono','Fira Code','Cascadia Code',monospace;
  font-size: 12px;
  z-index: 999999;
  color: #d4d4d4;
  box-sizing: border-box;
}
#datum-devtools * { box-sizing: border-box; }
#datum-devtools.hidden { display: none; }

#datum-devtools-resize {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 4px;
  cursor: ns-resize;
  z-index: 1;
}
#datum-devtools-resize:hover { background: rgba(37,99,235,0.3); }

#datum-dt-toolbar {
  display: flex;
  align-items: center;
  background: #252525;
  border-bottom: 1px solid #2e2e2e;
  padding: 0 10px;
  height: 34px;
  flex-shrink: 0;
  gap: 0;
  user-select: none;
}
.datum-dt-brand {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #2563eb;
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 0.04em;
  margin-right: 8px;
  flex-shrink: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.datum-dt-client-select {
  background: #1e1e1e;
  border: 1px solid #333;
  border-radius: 4px;
  color: #aaa;
  font-size: 10px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  padding: 2px 6px;
  margin-right: 12px;
  cursor: pointer;
  height: 22px;
  outline: none;
}
.datum-dt-tabs { display: flex; }
.datum-dt-tab {
  padding: 0 14px;
  height: 34px;
  display: flex;
  align-items: center;
  cursor: pointer;
  color: #666;
  border-bottom: 2px solid transparent;
  font-size: 11px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  transition: color 0.1s;
  margin-bottom: -1px;
}
.datum-dt-tab:hover { color: #bbb; }
.datum-dt-tab.active { color: #fff; border-bottom-color: #2563eb; }
.datum-dt-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.datum-dt-kbd {
  font-size: 9px;
  color: #444;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 3px;
  padding: 1px 5px;
}
.datum-dt-close {
  width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 4px;
  cursor: pointer;
  color: #555;
  font-size: 13px;
  background: none;
  border: none;
}
.datum-dt-close:hover { background: #333; color: #ccc; }

.datum-dt-panel { flex: 1; overflow: hidden; display: none; flex-direction: column; }
.datum-dt-panel.active { display: flex; }

.datum-dt-query-top {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid #252525;
  flex-shrink: 0;
}
.datum-dt-sql {
  flex: 1;
  height: 52px;
  background: #282828;
  border: 1px solid #383838;
  border-radius: 5px;
  color: #d4d4d4;
  font-family: 'SF Mono','Fira Code',monospace;
  font-size: 12px;
  padding: 7px 10px;
  resize: none;
  outline: none;
  line-height: 1.5;
}
.datum-dt-sql:focus { border-color: rgba(37,99,235,0.5); }
.datum-dt-sql.error { border-color: rgba(224,108,117,0.5); }
.datum-dt-run-col { display: flex; flex-direction: column; gap: 4px; align-items: flex-end; flex-shrink: 0; }
.datum-dt-run {
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 5px;
  padding: 0 16px;
  height: 32px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.datum-dt-run:hover { background: #1d50cc; }
.datum-dt-cmd-hint {
  font-size: 10px;
  color: #444;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.datum-dt-results { flex: 1; overflow: auto; }
.datum-dt-results-table { width: 100%; border-collapse: collapse; }
.datum-dt-results-table th {
  text-align: left; padding: 5px 12px;
  background: #222; color: #666;
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em;
  border-bottom: 1px solid #2a2a2a;
  position: sticky; top: 0; white-space: nowrap;
}
.datum-dt-results-table td {
  padding: 5px 12px; font-size: 11px;
  border-bottom: 1px solid #252525; white-space: nowrap;
}
.datum-dt-results-table tr:hover td { background: #242424; }
.datum-dt-cell-null { color: #444; font-style: italic; }
.datum-dt-error-msg { padding: 10px 12px; color: #e06c75; font-size: 11px; }
.datum-dt-results-bar {
  padding: 4px 12px; color: #444; font-size: 10px;
  border-top: 1px solid #252525; flex-shrink: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.datum-dt-schema-wrap { flex: 1; overflow: auto; }
.datum-dt-schema-table { width: 100%; border-collapse: collapse; }
.datum-dt-schema-table th {
  text-align: left; padding: 5px 12px;
  background: #222; color: #666;
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em;
  border-bottom: 1px solid #2a2a2a;
  position: sticky; top: 0;
}
.datum-dt-schema-table td { padding: 6px 12px; border-bottom: 1px solid #252525; font-size: 11px; }
.datum-dt-schema-table tr:hover td { background: #242424; }
.datum-dt-rb {
  display: inline-block; padding: 1px 6px; border-radius: 3px;
  font-size: 10px; font-weight: 700; letter-spacing: 0.03em;
}
.datum-dt-rb-id   { background: #1a2e4a; color: #6fa8dc; }
.datum-dt-rb-geom { background: #1a3328; color: #6db97e; }
.datum-dt-rb-upd  { background: #352818; color: #d4956a; }
.datum-dt-rb-prop { background: #281e3a; color: #a07fd4; }
.datum-dt-rb-data { background: #232323; color: #888; }
.datum-dt-col-type { color: #9cdcfe; font-family: 'SF Mono','Fira Code',monospace; }
.datum-dt-col-name { color: #e0e0e0; font-weight: 500; }
.datum-dt-col-nn   { color: #e06c75; font-size: 10px; }
.datum-dt-col-nul  { color: #444; font-size: 10px; }
.datum-dt-schema-bar {
  padding: 6px 12px; display: flex; gap: 16px;
  border-top: 1px solid #252525; flex-shrink: 0;
  font-size: 10px; color: #555;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.datum-dt-schema-bar b { color: #777; }
.datum-dt-hash { color: #6fa8dc; font-family: 'SF Mono','Fira Code',monospace; }

.datum-dt-stat-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 1px; background: #252525; flex-shrink: 0;
}
.datum-dt-stat-cell { background: #1e1e1e; padding: 14px 16px; }
.datum-dt-stat-lbl {
  font-size: 10px; color: #555; text-transform: uppercase;
  letter-spacing: 0.06em; margin-bottom: 5px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.datum-dt-stat-val {
  font-size: 16px; font-weight: 700; color: #ddd;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.datum-dt-stat-val.ok   { color: #6db97e; }
.datum-dt-stat-val.warn { color: #d4a96a; }
.datum-dt-stat-val.err  { color: #e06c75; }
.datum-dt-stat-sub {
  font-size: 10px; color: #444; margin-top: 3px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.datum-dt-dot {
  display: inline-block; width: 8px; height: 8px;
  border-radius: 50%; margin-right: 5px; vertical-align: middle;
}
.datum-dt-dot-g { background: #6db97e; box-shadow: 0 0 5px rgba(109,185,126,0.4); }
.datum-dt-dot-o { background: #d4a96a; }
.datum-dt-dot-r { background: #666; }
.datum-dt-notice {
  margin: 10px 12px;
  background: #1a2030;
  border: 1px solid #2a3555;
  border-radius: 6px;
  padding: 10px 12px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.datum-dt-notice-hdr {
  font-size: 11px; color: #6fa8dc; font-weight: 600; margin-bottom: 6px;
}
.datum-dt-diff { display: flex; flex-direction: column; gap: 2px; }
.datum-dt-diff-row {
  font-size: 10px; font-family: 'SF Mono','Fira Code',monospace;
  padding: 2px 6px; border-radius: 3px;
}
.datum-dt-diff-row.a { background: #1a2e1a; color: #6db97e; }
.datum-dt-diff-row.r { background: #2e1a1a; color: #e06c75; }
.datum-dt-diff-row.s { color: #444; }
.datum-dt-notice-time { font-size: 10px; color: #444; margin-top: 5px; }

.datum-dt-clear-wrap {
  padding: 10px 12px;
  border-top: 1px solid #252525;
}
.datum-dt-clear-btn {
  width: 100%;
  background: transparent;
  border: 1px solid #383838;
  color: #666;
  border-radius: 4px;
  padding: 6px 12px;
  font-size: 11px;
  cursor: pointer;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  transition: border-color 0.15s, color 0.15s;
}
.datum-dt-clear-btn:hover { border-color: #e06c75; color: #e06c75; }
.datum-dt-clear-hint {
  margin-top: 5px;
  font-size: 10px;
  color: #444;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

#datum-dt-fab {
  display: none;
  position: fixed;
  bottom: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #252525;
  border: 1px solid rgba(37,99,235,0.35);
  color: #2563eb;
  cursor: pointer;
  z-index: 999999;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 10px rgba(0,0,0,0.45);
  padding: 0;
}
#datum-dt-fab.visible { display: flex; }
#datum-dt-fab:hover { background: #2e2e2e; border-color: rgba(37,99,235,0.6); }

@media (pointer: coarse) {
  #datum-devtools-resize {
    height: 16px;
    top: -6px;
  }
  .datum-dt-kbd { display: none; }
}
`
