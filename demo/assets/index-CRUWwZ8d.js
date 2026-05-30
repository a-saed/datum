function I(t){return Array.isArray(t)?t:[t]}const H=`
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
`,N="datum-devtools:state",_=320;function B(){try{const t=localStorage.getItem(N);if(t)return JSON.parse(t)}catch{}return{open:!0,height:_}}function q(t){try{localStorage.setItem(N,JSON.stringify(t))}catch{}}const A=`<svg width="13" height="13" viewBox="0 0 18 18" fill="none">
  <circle cx="9" cy="9" r="7" stroke="#2563eb" stroke-width="1.8"/>
  <line x1="9" y1="1" x2="9" y2="4" stroke="#2563eb" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="9" y1="14" x2="9" y2="17" stroke="#2563eb" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="1" y1="9" x2="4" y2="9" stroke="#2563eb" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="14" y1="9" x2="17" y2="9" stroke="#2563eb" stroke-width="1.8" stroke-linecap="round"/>
  <circle cx="9" cy="9" r="2.2" fill="#2563eb"/>
</svg>`;function U(t){if(!document.getElementById("datum-devtools-css")){const a=document.createElement("style");a.id="datum-devtools-css",a.textContent=H,document.head.appendChild(a)}const e=B();let c=0,n="query";const u=[],o=document.createElement("div");o.id="datum-devtools",e.open||o.classList.add("hidden"),o.style.height=`${e.height}px`;const l=document.createElement("div");l.id="datum-devtools-resize",o.appendChild(l);const d=document.createElement("div");if(d.id="datum-dt-toolbar",d.innerHTML=`<div class="datum-dt-brand">${A} datum</div>`,t.length>1){const a=document.createElement("select");a.className="datum-dt-client-select",t.forEach((r,p)=>{const y=document.createElement("option");y.value=String(p),y.textContent=r.tableName,a.appendChild(y)}),a.addEventListener("change",()=>{c=Number(a.value),u.forEach(r=>r(n))}),d.appendChild(a)}const g=document.createElement("div");g.className="datum-dt-tabs",["Query","Schema","Status"].forEach(a=>{const r=document.createElement("div");r.className="datum-dt-tab"+(a.toLowerCase()===n?" active":""),r.textContent=a,r.addEventListener("click",()=>{document.querySelectorAll(".datum-dt-tab").forEach(p=>p.classList.remove("active")),r.classList.add("active"),n=a.toLowerCase(),u.forEach(p=>p(n))}),g.appendChild(r)}),d.appendChild(g);const x=document.createElement("div");x.className="datum-dt-right";const h=typeof navigator<"u"&&/mac/i.test(navigator.platform);x.innerHTML=`
    <span class="datum-dt-kbd">${h?"⌘":"Ctrl"}+Shift+D</span>
    <button class="datum-dt-close">✕</button>
  `,x.querySelector(".datum-dt-close").addEventListener("click",()=>f()),d.appendChild(x),o.appendChild(d);const i=document.createElement("div");i.id="datum-dt-panels",i.style.cssText="flex:1;overflow:hidden;display:flex;flex-direction:column",o.appendChild(i),document.body.appendChild(o);function f(){const a=o.classList.toggle("hidden");e.open=!a,q({...e,open:e.open})}typeof document<"u"&&document.addEventListener("keydown",a=>{(h?a.metaKey:a.ctrlKey)&&a.shiftKey&&a.key==="D"&&(a.preventDefault(),f())});let m=0,v=0;return l.addEventListener("mousedown",a=>{m=a.clientY,v=o.getBoundingClientRect().height;const r=y=>{const s=m-y.clientY,S=Math.max(120,Math.min(window.innerHeight*.8,v+s));o.style.height=`${S}px`,e.height=S},p=()=>{q(e),document.removeEventListener("mousemove",r),document.removeEventListener("mouseup",p)};document.addEventListener("mousemove",r),document.addEventListener("mouseup",p)}),{root:o,tabPanels:i,getActiveClient:()=>t[c],onTabChange:a=>{u.push(a)}}}function T(t,e){t.innerHTML=`
    <div class="datum-dt-query-top">
      <textarea class="datum-dt-sql" spellcheck="false"></textarea>
      <div class="datum-dt-run-col">
        <button class="datum-dt-run">▶ Run</button>
        <span class="datum-dt-cmd-hint">⌘ Enter</span>
      </div>
    </div>
    <div class="datum-dt-results"></div>
    <div class="datum-dt-results-bar">—</div>
  `;const c=t.querySelector(".datum-dt-sql"),n=t.querySelector(".datum-dt-run"),u=t.querySelector(".datum-dt-results"),o=t.querySelector(".datum-dt-results-bar");c.value=`SELECT * FROM ${e().tableName} LIMIT 10`;async function l(){const d=c.value.trim();if(!d)return;c.classList.remove("error");const g=performance.now();try{const b=await e().query(d),x=Math.round(performance.now()-g),h=b.rows;if(h.length===0){u.innerHTML='<div style="padding:12px;color:#444;font-size:11px;font-family:sans-serif">No rows returned</div>',o.textContent=`0 rows · ${x}ms · local PGlite`;return}const i=Object.keys(h[0]),f=i.map(v=>`<th>${$(v)}</th>`).join(""),m=h.map(v=>`<tr>${i.map(r=>{const p=v[r];if(p==null)return'<td class="datum-dt-cell-null">null</td>';const y=typeof p=="object"?JSON.stringify(p):String(p);return`<td title="${$(y)}">${$(O(y,80))}</td>`}).join("")}</tr>`).join("");u.innerHTML=`
        <table class="datum-dt-results-table">
          <thead><tr>${f}</tr></thead>
          <tbody>${m}</tbody>
        </table>`,o.textContent=`${h.length} row${h.length===1?"":"s"} · ${x}ms · local PGlite`}catch(b){c.classList.add("error"),u.innerHTML=`<div class="datum-dt-error-msg">${$(String(b))}</div>`,o.textContent=`Error · ${Math.round(performance.now()-g)}ms`}}n.addEventListener("click",l),c.addEventListener("keydown",d=>{(d.metaKey||d.ctrlKey)&&d.key==="Enter"&&(d.preventDefault(),l())})}function $(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function O(t,e){return t.length>e?t.slice(0,e)+"…":t}const D={id:"datum-dt-rb-id",geom:"datum-dt-rb-geom",updated_at:"datum-dt-rb-upd",properties:"datum-dt-rb-prop",data:"datum-dt-rb-data"};function R(t,e){t.innerHTML=`
    <div class="datum-dt-schema-wrap"></div>
    <div class="datum-dt-schema-bar">—</div>
  `;const c=t.querySelector(".datum-dt-schema-wrap"),n=t.querySelector(".datum-dt-schema-bar");async function u(){var x,h;const o=e(),l=o.columns;if(!l){c.innerHTML='<div style="padding:12px;color:#444;font-size:11px;font-family:sans-serif">Waiting for schema message…</div>',n.textContent="—";return}const d=l.map(i=>{const f=D[i.role]??"datum-dt-rb-data",m=i.nullable?'<span class="datum-dt-col-nul">nullable</span>':'<span class="datum-dt-col-nn">NOT NULL</span>';return`<tr>
        <td class="datum-dt-col-name">${C(i.name)}</td>
        <td class="datum-dt-col-type">${C(i.pg_type)}</td>
        <td><span class="datum-dt-rb ${f}">${C(i.role)}</span></td>
        <td>${m}</td>
      </tr>`}).join("");c.innerHTML=`
      <table class="datum-dt-schema-table">
        <thead><tr><th>column</th><th>pg_type</th><th>role</th><th>nullable</th></tr></thead>
        <tbody>${d}</tbody>
      </table>`;const g=l.filter(i=>i.role==="data").length;let b="—";try{b=((h=(x=(await o.query("SELECT value FROM _datum_meta WHERE key = 'schema_hash'")).rows[0])==null?void 0:x.value)==null?void 0:h.slice(0,8))??"—"}catch{}n.innerHTML=`
      <span>table <b>${C(o.tableName)}</b></span>
      <span>${l.length} columns · ${g} typed</span>
      <span>hash <b class="datum-dt-hash">${C(b)}</b></span>
      <span>mirrored from server ✓</span>
    `}u()}function C(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function j(t,e,c){const n=t.__dtStatusInterval;n!==void 0&&clearInterval(n),t.innerHTML=`
    <div class="datum-dt-stat-grid">
      <div class="datum-dt-stat-cell" id="datum-dt-s-conn">
        <div class="datum-dt-stat-lbl">connection</div>
        <div class="datum-dt-stat-val">—</div>
        <div class="datum-dt-stat-sub">—</div>
      </div>
      <div class="datum-dt-stat-cell" id="datum-dt-s-pending">
        <div class="datum-dt-stat-lbl">pending writes</div>
        <div class="datum-dt-stat-val">0</div>
        <div class="datum-dt-stat-sub">nothing queued</div>
      </div>
      <div class="datum-dt-stat-cell" id="datum-dt-s-snap">
        <div class="datum-dt-stat-lbl">last snapshot</div>
        <div class="datum-dt-stat-val">—</div>
        <div class="datum-dt-stat-sub">—</div>
      </div>
      <div class="datum-dt-stat-cell" id="datum-dt-s-schema">
        <div class="datum-dt-stat-lbl">schema</div>
        <div class="datum-dt-stat-val datum-dt-hash" style="font-size:13px">—</div>
        <div class="datum-dt-stat-sub">—</div>
      </div>
    </div>
    <div id="datum-dt-notice-area"></div>
  `;const u=t.querySelector("#datum-dt-s-conn .datum-dt-stat-val"),o=t.querySelector("#datum-dt-s-conn .datum-dt-stat-sub"),l=t.querySelector("#datum-dt-s-pending .datum-dt-stat-val"),d=t.querySelector("#datum-dt-s-pending .datum-dt-stat-sub"),g=t.querySelector("#datum-dt-s-schema .datum-dt-stat-val"),b=t.querySelector("#datum-dt-s-schema .datum-dt-stat-sub"),x=t.querySelector("#datum-dt-notice-area");if(c){const{prev:f,next:m,time:v}=c,a=new Set((f??[]).map(s=>s.name)),r=new Set(m.map(s=>s.name)),y=[...new Set([...(f??[]).map(s=>s.name),...m.map(s=>s.name)])].map(s=>{const S=a.has(s),E=r.has(s);if(!S){const w=m.find(M=>M.name===s);return`<div class="datum-dt-diff-row a">+ ${k(s)} · <span style="opacity:0.7">${k(w.pg_type)}</span></div>`}if(!E){const w=(f??[]).find(M=>M.name===s);return`<div class="datum-dt-diff-row r">- ${k(s)} · <span style="opacity:0.7">${k(w.pg_type)}</span></div>`}const L=m.find(w=>w.name===s);return`<div class="datum-dt-diff-row s">&nbsp; ${k(s)} · <span style="opacity:0.5">${k(L.pg_type)}</span></div>`}).join("");x.innerHTML=`
      <div class="datum-dt-notice">
        <div class="datum-dt-notice-hdr">⚡ Schema changed — local DB wiped &amp; resynced</div>
        <div class="datum-dt-diff">${y}</div>
        <div class="datum-dt-notice-time">${P(v)} · triggered by server schema change</div>
      </div>`}function h(){const f=e(),m=f.connectionStatus,v=f.pendingCount,a=m==="connected"?"datum-dt-dot-g":m==="connecting"?"datum-dt-dot-o":"datum-dt-dot-r",r=m==="connected"?"ok":m==="connecting"?"warn":"err";u.className=`datum-dt-stat-val ${r}`,u.innerHTML=`<span class="datum-dt-dot ${a}"></span>${m}`,o.textContent=f.tableName,l.className=`datum-dt-stat-val ${v>0?"warn":""}`,l.textContent=String(v),d.textContent=v>0?"in outbox · syncing soon":"nothing queued",f.query("SELECT value FROM _datum_meta WHERE key = 'schema_hash'").then(p=>{var S,E,L;const y=((E=(S=p.rows[0])==null?void 0:S.value)==null?void 0:E.slice(0,8))??"—",s=((L=f.columns)==null?void 0:L.length)??0;g.textContent=y,b.textContent=`${s} cols · v3 · in sync`}).catch(()=>{})}h();const i=setInterval(h,1e3);t.__dtStatusInterval=i}function P(t){const e=Math.floor((Date.now()-t.getTime())/1e3);return e<60?`${e}s ago`:e<3600?`${Math.floor(e/60)}m ago`:`${Math.floor(e/3600)}h ago`}function k(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}let F=!1;function G(t){if(F)return;F=!0;const e=I(t);if(e.length===0)return;const c=new Map;for(const d of e)d.onSchemaChange(({prev:g,next:b})=>{c.set(d.tableName,{prev:g,next:b,time:new Date})});const n=U(e),u=z(!0),o=z(!1),l=z(!1);n.tabPanels.append(u,o,l),T(u,n.getActiveClient),n.onTabChange(d=>{const g=n.getActiveClient(),b=c.get(g.tableName)??null;u.classList.toggle("active",d==="query"),o.classList.toggle("active",d==="schema"),l.classList.toggle("active",d==="status"),d==="query"&&T(u,n.getActiveClient),d==="schema"&&R(o,n.getActiveClient),d==="status"&&j(l,n.getActiveClient,b)})}function z(t){const e=document.createElement("div");return e.className="datum-dt-panel"+(t?" active":""),e}export{G as initDatumDevtools};
