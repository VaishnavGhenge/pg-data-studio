// Run after npm run build. Uses an isolated headless Chrome profile and mock IPC;
// never opens a real database or the user's Electron profile.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pgstudio-browser-"));
  const root = path.resolve("out/renderer");
  const server = http.createServer((req, res) => {
    const file = path.resolve(
      root,
      "." + (req.url === "/" ? "/index.html" : req.url.split("?")[0]),
    );
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      "Content-Type",
      file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html",
    );
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const chrome = spawn(
    process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    [
      "--headless=new",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--remote-debugging-port=0",
      "--user-data-dir=" + profile,
      "--window-size=1400,900",
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
    const tabs = await (await fetch("http://127.0.0.1:" + port + "/json")).json();
    socket = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
    let id = 0;
    const pending = new Map();
    const errors = [];
    socket.addEventListener("message", (e) => {
      const message = JSON.parse(e.data);
      if (message.id) {
        pending.get(message.id)?.(message);
        pending.delete(message.id);
      }
      if (message.method === "Runtime.exceptionThrown")
        errors.push(message.params.exceptionDetails.text);
    });
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const requestId = ++id;
        const timeout = setTimeout(() => {
          pending.delete(requestId);
          reject(Error("CDP timeout: " + method));
        }, 15000);
        pending.set(requestId, (msg) => {
          clearTimeout(timeout);
          if (msg.error) reject(Error(msg.error.message));
          else resolve(msg.result);
        });
        socket.send(JSON.stringify({ id: requestId, method, params }));
      });
    async function evaluate(expression) {
      const result = await send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails)
        throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    }
    await send("Runtime.enable");
    await send("Page.enable");
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
      const ok = data => Promise.resolve({ok:true,data});
      const columns = ['id','name','notes','json'].map((name,i)=>({name,dataType:i===3?'jsonb':'text',ordinal:i+1,isPk:i===0,notNull:i===0}));
      const records = Array.from({length:230},(_,i)=>({id:String(i+1),name:'Person '+(i+1),notes:i===0?null:'Note '+i,json:'{"id":9007199254740993,"active":true}'}));
      window.testCalls=[];
      window.api={
        listSources:()=>ok([{id:'local',name:'Local demo',host:'localhost',port:5432,database:'demo',user:'demo'}]),
        connect:()=>ok({database:'demo',host:'localhost',serverVersion:'PostgreSQL 17'}),
        disconnect:()=>ok(true),
        listTables:()=>ok([{schema:'public',name:'people',estRows:230},{schema:'public',name:'books',estRows:230}]),
        tableColumns:()=>ok({columns,pk:['id']}),
        query:async(schema,table,opts)=>{
          window.testCalls.push({table,opts}); await new Promise(r=>setTimeout(r,30));
          if(opts.where==='bad') return {ok:false,error:'Invalid WHERE expression'};
          return {ok:true,data:{columns,pk:['id'],rows:records.slice(opts.offset,opts.offset+opts.limit),offset:opts.offset,hasMore:opts.offset+opts.limit<records.length,ms:12,previewSql:'SELECT * FROM public.'+table}};
        },
        applyChanges:async(schema,table,changes)=>{changes.forEach(c=>Object.assign(records.find(r=>r.id===c.pk.id),c.set));return {ok:true,data:{updated:changes.length,statements:[]}}},
        countRows:()=>ok('230'),beep:()=>ok(true),
      };
      window.clipboardText='';
      Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.clipboardText=text}}});
    `,
    });
    await send("Page.navigate", { url: "http://127.0.0.1:" + server.address().port });
    await delay(500);
    await evaluate(`window.clickText=(text)=>{const el=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);if(!el)throw Error('Missing button: '+text);el.click()};
      window.key=(el,key,extra={})=>el.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,...extra}));
      window.setInput=(el,value)=>{Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}))};
      document.querySelector('.nrow.source').click()`);
    await delay(100);
    await evaluate(`document.querySelector('.nrow.table').click()`);
    await delay(150);
    assert.equal(
      await evaluate(`document.querySelectorAll('.interactive-grid tbody tr').length`),
      200,
    );
    await evaluate(
      `const table=document.querySelector('.interactive-grid');table.focus();key(table,'ArrowRight');`,
    );
    await delay(40);
    await evaluate(`key(document.querySelector('.interactive-grid'),'Enter')`);
    await delay(40);
    await evaluate(`setInput(document.querySelector('.cell-input'),'Updated name')`);
    await delay(30);
    await evaluate(`key(document.querySelector('.cell-input'),'Enter')`);
    await delay(80);
    assert.match(
      await evaluate(`document.querySelector('.pending-count').textContent`),
      /1 cell in 1 row/,
    );
    await evaluate(`document.querySelector('[aria-label="Undo"]').click()`);
    await delay(30);
    assert.equal(await evaluate(`document.querySelector('.pending-count')`), null);
    await evaluate(`document.querySelector('[aria-label="Redo"]').click()`);
    await delay(30);
    await evaluate(
      `[...document.querySelectorAll('.nrow.table')].find(e=>e.textContent.includes('books')).click()`,
    );
    await delay(100);
    assert.equal(await evaluate(`document.querySelectorAll('[role=tab]').length`), 2);
    await evaluate(`document.querySelector('[role=tab]').click()`);
    await delay(70);
    assert.match(await evaluate(`document.querySelector('.pending-count').textContent`), /1 cell/);
    await evaluate(`document.querySelector('.toolbar .btn.primary').click()`);
    await delay(50);
    assert.equal(await evaluate(`document.querySelectorAll('.change-review tbody tr').length`), 1);
    await evaluate(`clickText('Cancel')`);
    await delay(30);
    await evaluate(`clickText('Revert all')`);
    await delay(30);
    await evaluate(`document.querySelector('[data-row="0"][data-col="0"]').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));
      document.querySelector('[data-row="1"][data-col="1"]').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0,shiftKey:true}));`);
    await delay(40);
    await evaluate(`key(document.querySelector('.interactive-grid'),'c',{ctrlKey:true})`);
    await delay(30);
    assert.equal(await evaluate(`window.clipboardText`), "1\tPerson 1\n2\tPerson 2");
    await evaluate(`clickText('Columns')`);
    await delay(30);
    await evaluate(`document.querySelector('.column-chooser input').click()`);
    await delay(30);
    assert.equal(
      await evaluate(`document.querySelectorAll('.interactive-grid thead th').length`),
      4,
    );
    await evaluate(`clickText('Reset columns')`);
    await delay(40);
    await evaluate(
      `document.querySelector('[data-row="0"][data-col="3"]').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));`,
    );
    await delay(30);
    await evaluate(`key(document.querySelector('.interactive-grid'),'F2')`);
    await delay(30);
    await evaluate(`clickText('Format JSON')`);
    await delay(30);
    assert.match(
      await evaluate(`document.querySelector('.value-inspector textarea').value`),
      /9007199254740993/,
    );
    await evaluate(`clickText('Display settings')`);
    await delay(50);
    await evaluate(
      `const s=document.querySelector('.settings-form select');s.value='dark';s.dispatchEvent(new Event('change',{bubbles:true}));`,
    );
    await delay(50);
    assert.equal(await evaluate(`document.documentElement.dataset.theme`), "dark");
    await evaluate(`clickText('Done')`);
    await delay(30);
    await evaluate(`document.querySelector('[aria-label="Close inspector"]').click()`);
    await delay(30);
    await evaluate(`document.querySelector('[aria-label="Next page"]').click()`);
    await delay(100);
    assert.match(await evaluate(`document.querySelector('.pager-range').textContent`), /201–230/);
    await evaluate(`clickText('Count matching rows')`);
    await delay(50);
    assert.match(
      await evaluate(`document.querySelector('.table-status').textContent`),
      /230 matching rows/,
    );
    const screenshot = await send("Page.captureScreenshot", { format: "png" });
    const screenshotPath = path.join(os.tmpdir(), "pgstudio-ui-smoke.png");
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
    assert.deepEqual(errors, []);
    console.log(
      "UI smoke passed: editing, history, tabs, review, TSV, columns, inspector, theme, pagination, count.",
    );
    console.log("Screenshot: " + screenshotPath);
  } finally {
    socket?.close();
    chrome.kill();
    server.close();
    await delay(500);
    fs.rmSync(profile, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
