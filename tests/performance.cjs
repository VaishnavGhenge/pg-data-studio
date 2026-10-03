// Run against a production renderer with Node 22+ and Chrome. Uses identical
// deterministic 64-column data and isolated profiles; database time is excluded.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { spawn, execFileSync } = require("node:child_process");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
const summarize = (values) => ({
  median: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  samples: values,
});

async function main() {
  const root = path.resolve(process.env.RENDERER_ROOT || "out/renderer");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pgstudio-perf-"));
  const label = process.env.PERF_LABEL || "current";
  const output = path.resolve(process.env.PERF_OUTPUT || `release/performance/${label}.json`);
  const server = http.createServer((req, res) => {
    const file = path.resolve(
      root,
      "." + (req.url === "/" ? "/index.html" : req.url.split("?")[0]),
    );
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
    res.setHeader(
      "Content-Type",
      file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html",
    );
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const chrome = spawn(
    process.env.CHROME_PATH || "/usr/bin/google-chrome",
    [
      "--headless=new",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--remote-debugging-port=0",
      "--user-data-dir=" + profile,
      "--window-size=1920,1103",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let socket;
  try {
    const portFile = path.join(profile, "DevToolsActivePort");
    for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await delay(100);
    assert.ok(fs.existsSync(portFile), "Chrome must start");
    const port = fs.readFileSync(portFile, "utf8").split("\n")[0];
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    socket = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    let id = 0;
    const pending = new Map(),
      errors = [];
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method === "Runtime.exceptionThrown")
        errors.push(message.params.exceptionDetails.text);
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(Error(message.error.message));
      else request.resolve(message.result);
    });
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const requestId = ++id;
        const timer = setTimeout(() => {
          pending.delete(requestId);
          reject(Error("CDP timeout: " + method));
        }, 30000);
        pending.set(requestId, { resolve, reject, timer });
        socket.send(JSON.stringify({ id: requestId, method, params }));
      });
    async function evaluate(expression) {
      const result = await send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails)
        throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    }
    async function waitFor(expression) {
      for (let i = 0; i < 200; i++) {
        if (await evaluate(expression)) return;
        await delay(50);
      }
      throw Error("Timed out: " + expression);
    }
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Performance.enable");
    const browser = await send("Browser.getVersion");
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
      localStorage.clear();
      localStorage.setItem('pgstudio:display',JSON.stringify({theme:'dark',density:'compact',fontSize:12}));
      const ok = data => Promise.resolve({ok:true,data});
      const names = ['id','label','amount','created_at',...Array.from({length:60},(_,i)=>'field_'+String(i+1).padStart(2,'0'))];
      const columns=names.map((name,i)=>({name,dataType:i===0?'bigint':i===2?'numeric(18,4)':i===3?'timestamp with time zone':'text',ordinal:i+1,isPk:i===0,notNull:i<2}));
      const records=Array.from({length:2000},(_,r)=>Object.fromEntries(names.map((name,c)=>[name,c===0?String(r+1):c===1?'Wide row '+(r+1):c===2?((r+1)/100).toFixed(4):c===3?'2024-01-01 05:30:01+05:30':(r+c)%23===0?null:'Value '+c+' / row '+(r+1)+' / abcd0123456789'])));
      window.api={listSources:()=>ok([{id:'perf',name:'Performance fixture',host:'localhost',port:5432,database:'demo',user:'demo'}]),connect:()=>ok({database:'demo',host:'localhost',serverVersion:'PostgreSQL'}),disconnect:()=>ok(true),listTables:()=>ok([{schema:'demo',name:'wide_grid',estRows:25000}]),tableColumns:()=>ok({columns,pk:['id']}),query:(_s,_t,o)=>ok({columns,pk:['id'],rows:records.slice(o.offset,o.offset+o.limit),offset:o.offset,hasMore:o.offset+o.limit<records.length,ms:0,previewSql:'SELECT * FROM demo.wide_grid'}),applyChanges:()=>ok({updated:0,statements:[]}),countRows:()=>ok('25000'),beep:()=>ok(true)};
      window.afterPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      window.measureAction=async action=>{const start=performance.now();action();await afterPaint();return performance.now()-start};
      window.key=(key,extra={})=>document.querySelector('.interactive-grid').dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,...extra}));
    `,
    });
    const metrics = async () =>
      Object.fromEntries(
        (await send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]),
      );
    const delta = (a, b) =>
      Object.fromEntries(
        ["ScriptDuration", "LayoutDuration", "RecalcStyleDuration", "TaskDuration"].map((name) => [
          name + "Ms",
          (b[name] - a[name]) * 1000,
        ]),
      );
    const scenarios = [];
    for (const pageSize of [200, 1000]) {
      const loads = [],
        repetitions = [];
      for (let repetition = 0; repetition < 3; repetition++) {
        await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/` });
        await waitFor(`!!document.querySelector('.nrow.source')`);
        await evaluate(`document.querySelector('.nrow.source').click()`);
        await waitFor(`!!document.querySelector('.nrow.table')`);
        const load = await evaluate(
          `(async()=>{const start=performance.now();document.querySelector('.nrow.table').click();while(!document.querySelector('.interactive-grid')||document.querySelector('.query-feedback'))await new Promise(r=>setTimeout(r,0));${pageSize === 1000 ? `const s=document.querySelector('select[aria-label="Page size"]');s.value='1000';s.dispatchEvent(new Event('change',{bubbles:true}));while(document.querySelector('.interactive-grid')?.getAttribute('aria-rowcount')!=='1001'||document.querySelector('.query-feedback'))await new Promise(r=>setTimeout(r,0));` : ""}await afterPaint();return performance.now()-start})()`,
        );
        loads.push(load);
        await send("HeapProfiler.collectGarbage");
        const dom = await evaluate(
          `({cells:document.querySelectorAll('[role="gridcell"]').length,rows:document.querySelectorAll('.interactive-grid tbody tr[data-row],.interactive-grid tbody tr:not([aria-hidden="true"])').length,nodes:document.getElementsByTagName('*').length,viewport:{width:innerWidth,height:innerHeight},grid:{width:document.querySelector('.grid-scroll').clientWidth,height:document.querySelector('.grid-scroll').clientHeight}})`,
        );
        const heap = (await metrics()).JSHeapUsedSize;
        const beforeKeys = await metrics();
        const keys = [];
        for (let i = 0; i < 18; i++)
          keys.push(
            await evaluate(`measureAction(()=>key('${i % 3 === 0 ? "ArrowDown" : "ArrowRight"}'))`),
          );
        const keyWork = delta(beforeKeys, await metrics());
        await evaluate(
          `(async()=>{const sc=document.querySelector('.grid-scroll');sc.scrollTop=0;sc.scrollLeft=0;await afterPaint()})()`,
        );
        const beforeSelection = await metrics();
        const selections = [];
        for (let i = 0; i < 12; i++)
          selections.push(
            await evaluate(
              `measureAction(()=>{const el=document.querySelector('[data-row="${i % 2 ? 16 : 12}"][data-col="${i % 2 ? 6 : 3}"]');if(!el)throw Error('Selection target missing');el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0,shiftKey:true}))})`,
            ),
          );
        const selectionWork = delta(beforeSelection, await metrics());
        const beforeScroll = await metrics();
        const scrolling = await evaluate(
          `(async()=>{const sc=document.querySelector('.grid-scroll'),frames=[];let previous=performance.now();for(let i=0;i<90;i++){sc.scrollTop=Math.min(i*20,sc.scrollHeight-sc.clientHeight);sc.scrollLeft=i<45?i*32:(90-i)*32;await new Promise(requestAnimationFrame);const now=performance.now();frames.push(now-previous);previous=now}return frames})()`,
        );
        const scrollWork = delta(beforeScroll, await metrics());
        repetitions.push({
          dom,
          heapBytes: heap,
          keyboard: summarize(keys.slice(3)),
          keyWork,
          selection: summarize(selections.slice(2)),
          selectionWork,
          scrollFrames: summarize(scrolling.slice(5)),
          framesOver50ms: scrolling.slice(5).filter((ms) => ms > 50).length,
          scrollWork,
        });
      }
      scenarios.push({ pageSize, loadMs: summarize(loads), repetitions });
      console.log(
        `${label}: ${pageSize} rows: ${repetitions[0].dom.cells} mounted cells, selection ${summarize(repetitions.map((r) => r.selection.median)).median.toFixed(1)} ms median`,
      );
    }
    assert.deepEqual(errors, [], "Renderer must not throw");
    if (process.env.PERF_EXPECT_VIRTUAL === "1")
      for (const scenario of scenarios)
        for (const repeat of scenario.repetitions) {
          assert.ok(
            repeat.dom.cells < 2000,
            `Visible cell count must be bounded: ${repeat.dom.cells}`,
          );
        }
    const result = {
      label,
      capturedAt: new Date().toISOString(),
      gitRevision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      browser: browser.product,
      rendererSha256: (() => {
        const hash = createHash("sha256");
        function add(directory) {
          for (const entry of fs
            .readdirSync(directory, { withFileTypes: true })
            .sort((a, b) => a.name.localeCompare(b.name))) {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) add(file);
            else hash.update(fs.readFileSync(file));
          }
        }
        add(root);
        return hash.digest("hex");
      })(),
      cpu: os.cpus()[0]?.model,
      method:
        "Isolated headless Chrome production renderer; deterministic 64-column fixture; 3 repetitions; no recording; no database or IPC latency. Input-to-paint samples await two animation frames. Not a native Electron GPU benchmark.",
      scenarios,
    };
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
    console.log("Results: " + output);
  } finally {
    socket?.close();
    chrome.kill();
    await new Promise((resolve) => server.close(resolve));
    await delay(300);
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
