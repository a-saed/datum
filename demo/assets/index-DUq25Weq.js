function H(t){return Array.isArray(t)?t:[t]}const _=`
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
`,I="datum-devtools:state",B=320;function A(){try{const t=localStorage.getItem(I);if(t)return JSON.parse(t)}catch{}return{open:!0,height:B}}function z(t){try{localStorage.setItem(I,JSON.stringify(t))}catch{}}const q=`<svg width="13" height="13" viewBox="0 0 48 48" fill="none">
  <polyline points="17,10 6,24 17,38" stroke="#2563eb" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
  <polyline points="31,10 42,24 31,38" stroke="#2563eb" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="24" cy="24" r="8" stroke="#2563eb" stroke-width="1.5" fill="none" opacity="0.5"/>
  <circle cx="24" cy="24" r="3.5" fill="#2563eb"/>
</svg>`;function U(t){if(!document.getElementById("datum-devtools-css")){const e=document.createElement("style");e.id="datum-devtools-css",e.textContent=_,document.head.appendChild(e)}const d=A();let u=0,i="query";const m=[],r=document.createElement("button");r.id="datum-dt-fab",r.title="Open datum devtools",r.innerHTML=q,r.addEventListener("click",()=>c()),document.body.appendChild(r);const o=document.createElement("div");o.id="datum-devtools",d.open||(o.classList.add("hidden"),r.classList.add("visible")),o.style.height=`${d.height}px`;const n=document.createElement("div");n.id="datum-devtools-resize",o.appendChild(n);const p=document.createElement("div");if(p.id="datum-dt-toolbar",p.innerHTML=`<div class="datum-dt-brand">${q} datum</div>`,t.length>1){const e=document.createElement("select");e.className="datum-dt-client-select",t.forEach((s,a)=>{const v=document.createElement("option");v.value=String(a),v.textContent=s.tableName,e.appendChild(v)}),e.addEventListener("change",()=>{u=Number(e.value),m.forEach(s=>s(i))}),p.appendChild(e)}const f=document.createElement("div");f.className="datum-dt-tabs",["Query","Schema","Status"].forEach(e=>{const s=document.createElement("div");s.className="datum-dt-tab"+(e.toLowerCase()===i?" active":""),s.textContent=e,s.addEventListener("click",()=>{document.querySelectorAll(".datum-dt-tab").forEach(a=>a.classList.remove("active")),s.classList.add("active"),i=e.toLowerCase(),m.forEach(a=>a(i))}),f.appendChild(s)}),p.appendChild(f);const g=document.createElement("div");g.className="datum-dt-right";const h=typeof navigator<"u"&&/mac/i.test(navigator.platform);g.innerHTML=`
    <span class="datum-dt-kbd">${h?"⌘":"Ctrl"}+Shift+D</span>
    <button class="datum-dt-close">✕</button>
  `,g.querySelector(".datum-dt-close").addEventListener("click",()=>c()),p.appendChild(g),o.appendChild(p);const l=document.createElement("div");l.id="datum-dt-panels",l.style.cssText="flex:1;overflow:hidden;display:flex;flex-direction:column",o.appendChild(l),document.body.appendChild(o);function c(){const e=o.classList.toggle("hidden");r.classList.toggle("visible",e),d.open=!e,z({...d,open:d.open})}typeof document<"u"&&document.addEventListener("keydown",e=>{(h?e.metaKey:e.ctrlKey)&&e.shiftKey&&e.key==="D"&&(e.preventDefault(),c())});let b=0,y=0;function S(e){const s=b-e,a=Math.max(120,Math.min(window.innerHeight*.8,y+s));o.style.height=`${a}px`,d.height=a}return n.addEventListener("mousedown",e=>{b=e.clientY,y=o.getBoundingClientRect().height;const s=v=>S(v.clientY),a=()=>{z(d),document.removeEventListener("mousemove",s),document.removeEventListener("mouseup",a)};document.addEventListener("mousemove",s),document.addEventListener("mouseup",a)}),n.addEventListener("touchstart",e=>{e.preventDefault(),b=e.touches[0].clientY,y=o.getBoundingClientRect().height;const s=v=>S(v.touches[0].clientY),a=()=>{z(d),document.removeEventListener("touchmove",s),document.removeEventListener("touchend",a)};document.addEventListener("touchmove",s,{passive:!1}),document.addEventListener("touchend",a)},{passive:!1}),{root:o,tabPanels:l,getActiveClient:()=>t[u],onTabChange:e=>{m.push(e)}}}function F(t,d){t.innerHTML=`
    <div class="datum-dt-query-top">
      <textarea class="datum-dt-sql" spellcheck="false"></textarea>
      <div class="datum-dt-run-col">
        <button class="datum-dt-run">▶ Run</button>
        <span class="datum-dt-cmd-hint">⌘ Enter</span>
      </div>
    </div>
    <div class="datum-dt-results"></div>
    <div class="datum-dt-results-bar">—</div>
  `;const u=t.querySelector(".datum-dt-sql"),i=t.querySelector(".datum-dt-run"),m=t.querySelector(".datum-dt-results"),r=t.querySelector(".datum-dt-results-bar");u.value=`SELECT * FROM ${d().tableName} LIMIT 10`;async function o(){const n=u.value.trim();if(!n)return;u.classList.remove("error");const p=performance.now();try{const f=await d().query(n),x=Math.round(performance.now()-p),g=f.rows;if(g.length===0){m.innerHTML='<div style="padding:12px;color:#444;font-size:11px;font-family:sans-serif">No rows returned</div>',r.textContent=`0 rows · ${x}ms · local PGlite`;return}const h=Object.keys(g[0]),l=h.map(b=>`<th>${M(b)}</th>`).join(""),c=g.map(b=>`<tr>${h.map(S=>{const e=b[S];if(e==null)return'<td class="datum-dt-cell-null">null</td>';const s=typeof e=="object"?JSON.stringify(e):String(e);return`<td title="${M(s)}">${M(O(s,80))}</td>`}).join("")}</tr>`).join("");m.innerHTML=`
        <table class="datum-dt-results-table">
          <thead><tr>${l}</tr></thead>
          <tbody>${c}</tbody>
        </table>`,r.textContent=`${g.length} row${g.length===1?"":"s"} · ${x}ms · local PGlite`}catch(f){u.classList.add("error"),m.innerHTML=`<div class="datum-dt-error-msg">${M(String(f))}</div>`,r.textContent=`Error · ${Math.round(performance.now()-p)}ms`}}i.addEventListener("click",o),u.addEventListener("keydown",n=>{(n.metaKey||n.ctrlKey)&&n.key==="Enter"&&(n.preventDefault(),o())})}function M(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function O(t,d){return t.length>d?t.slice(0,d)+"…":t}const D={id:"datum-dt-rb-id",geom:"datum-dt-rb-geom",updated_at:"datum-dt-rb-upd",properties:"datum-dt-rb-prop",data:"datum-dt-rb-data"};function j(t,d){t.innerHTML=`
    <div class="datum-dt-schema-wrap"></div>
    <div class="datum-dt-schema-bar">—</div>
  `;const u=t.querySelector(".datum-dt-schema-wrap"),i=t.querySelector(".datum-dt-schema-bar");async function m(){var x,g;const r=d(),o=r.columns;if(!o){u.innerHTML='<div style="padding:12px;color:#444;font-size:11px;font-family:sans-serif">Waiting for schema message…</div>',i.textContent="—";return}const n=o.map(h=>{const l=D[h.role]??"datum-dt-rb-data",c=h.nullable?'<span class="datum-dt-col-nul">nullable</span>':'<span class="datum-dt-col-nn">NOT NULL</span>';return`<tr>
        <td class="datum-dt-col-name">${E(h.name)}</td>
        <td class="datum-dt-col-type">${E(h.pg_type)}</td>
        <td><span class="datum-dt-rb ${l}">${E(h.role)}</span></td>
        <td>${c}</td>
      </tr>`}).join("");u.innerHTML=`
      <table class="datum-dt-schema-table">
        <thead><tr><th>column</th><th>pg_type</th><th>role</th><th>nullable</th></tr></thead>
        <tbody>${n}</tbody>
      </table>`;const p=o.filter(h=>h.role==="data").length;let f="—";try{f=((g=(x=(await r.query("SELECT value FROM _datum_meta WHERE key = 'schema_hash'")).rows[0])==null?void 0:x.value)==null?void 0:g.slice(0,8))??"—"}catch{}i.innerHTML=`
      <span>table <b>${E(r.tableName)}</b></span>
      <span>${o.length} columns · ${p} typed</span>
      <span>hash <b class="datum-dt-hash">${E(f)}</b></span>
      <span>mirrored from server ✓</span>
    `}m()}function E(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function R(t,d,u){const i=t.__dtStatusInterval;i!==void 0&&clearInterval(i),t.innerHTML=`
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
  `;const m=t.querySelector("#datum-dt-s-conn .datum-dt-stat-val"),r=t.querySelector("#datum-dt-s-conn .datum-dt-stat-sub"),o=t.querySelector("#datum-dt-s-pending .datum-dt-stat-val"),n=t.querySelector("#datum-dt-s-pending .datum-dt-stat-sub"),p=t.querySelector("#datum-dt-s-schema .datum-dt-stat-val"),f=t.querySelector("#datum-dt-s-schema .datum-dt-stat-sub"),x=t.querySelector("#datum-dt-notice-area");if(u){const{prev:l,next:c,time:b}=u,y=new Set((l??[]).map(a=>a.name)),S=new Set(c.map(a=>a.name)),s=[...new Set([...(l??[]).map(a=>a.name),...c.map(a=>a.name)])].map(a=>{const v=y.has(a),L=S.has(a);if(!v){const w=c.find($=>$.name===a);return`<div class="datum-dt-diff-row a">+ ${k(a)} · <span style="opacity:0.7">${k(w.pg_type)}</span></div>`}if(!L){const w=(l??[]).find($=>$.name===a);return`<div class="datum-dt-diff-row r">- ${k(a)} · <span style="opacity:0.7">${k(w.pg_type)}</span></div>`}const C=c.find(w=>w.name===a);return`<div class="datum-dt-diff-row s">&nbsp; ${k(a)} · <span style="opacity:0.5">${k(C.pg_type)}</span></div>`}).join("");x.innerHTML=`
      <div class="datum-dt-notice">
        <div class="datum-dt-notice-hdr">⚡ Schema changed — local DB wiped &amp; resynced</div>
        <div class="datum-dt-diff">${s}</div>
        <div class="datum-dt-notice-time">${P(b)} · triggered by server schema change</div>
      </div>`}function g(){const l=d(),c=l.connectionStatus,b=l.pendingCount,y=c==="connected"?"datum-dt-dot-g":c==="connecting"?"datum-dt-dot-o":"datum-dt-dot-r",S=c==="connected"?"ok":c==="connecting"?"warn":"err";m.className=`datum-dt-stat-val ${S}`,m.innerHTML=`<span class="datum-dt-dot ${y}"></span>${c}`,r.textContent=l.tableName,o.className=`datum-dt-stat-val ${b>0?"warn":""}`,o.textContent=String(b),n.textContent=b>0?"in outbox · syncing soon":"nothing queued",l.query("SELECT value FROM _datum_meta WHERE key = 'schema_hash'").then(e=>{var v,L,C;const s=((L=(v=e.rows[0])==null?void 0:v.value)==null?void 0:L.slice(0,8))??"—",a=((C=l.columns)==null?void 0:C.length)??0;p.textContent=s,f.textContent=`${a} cols · v3 · in sync`}).catch(()=>{})}g();const h=setInterval(g,1e3);t.__dtStatusInterval=h}function P(t){const d=Math.floor((Date.now()-t.getTime())/1e3);return d<60?`${d}s ago`:d<3600?`${Math.floor(d/60)}m ago`:`${Math.floor(d/3600)}h ago`}function k(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}let N=!1;function G(t){if(N)return;N=!0;const d=H(t);if(d.length===0)return;const u=new Map;for(const n of d)n.onSchemaChange(({prev:p,next:f})=>{u.set(n.tableName,{prev:p,next:f,time:new Date})});const i=U(d),m=T(!0),r=T(!1),o=T(!1);i.tabPanels.append(m,r,o),F(m,i.getActiveClient),i.onTabChange(n=>{const p=i.getActiveClient(),f=u.get(p.tableName)??null;m.classList.toggle("active",n==="query"),r.classList.toggle("active",n==="schema"),o.classList.toggle("active",n==="status"),n==="query"&&F(m,i.getActiveClient),n==="schema"&&j(r,i.getActiveClient),n==="status"&&R(o,i.getActiveClient,f)})}function T(t){const d=document.createElement("div");return d.className="datum-dt-panel"+(t?" active":""),d}export{G as initDatumDevtools};
