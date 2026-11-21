// Run after npm run build. Uses an isolated headless Chrome profile and mock IPC;
// never opens a real database or the user's Electron profile.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function contrastRatio(a, b) {
  const luminance = (color) =>
    color
      .match(/\d+/g)
      .map((value) => Number(value) / 255)
      .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
      .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const values = [luminance(a), luminance(b)].sort((first, second) => second - first);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

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
    async function waitFor(expression) {
      for (let i = 0; i < 150; i++) {
        if (await evaluate(expression)) return;
        await delay(40);
      }
      throw Error("Timed out: " + expression);
    }
    async function checkContrast(theme) {
      const samples = await evaluate(`(()=>{
        const style = (selector, pseudo) => getComputedStyle(document.querySelector(selector), pseudo);
        const selected = '.quick-open-result[aria-selected="true"]';
        return [
          ['Table breadcrumb', style('.table-breadcrumb').color, style('.main').backgroundColor, 4.5],
          ['Grid header type', style('.interactive-grid .typ').color, style('.interactive-grid th').backgroundColor, 4.5],
          ['Search placeholder', style('.page-search', '::placeholder').color, style('.page-search').backgroundColor, 4.5],
          ['Quick Open result type', style(selected + ' .result-type').color, style(selected).backgroundColor, 4.5],
          ['Sidebar search border', style('.tree-filter').borderTopColor, style('.side').backgroundColor, 3],
          ['Page search border', style('.page-search').borderTopColor, style('.main').backgroundColor, 3],
          ['Quick Open selected border', style(selected).borderTopColor, style(selected).backgroundColor, 3],
        ];
      })()`);
      for (const [name, foreground, background, minimum] of samples) {
        const ratio = contrastRatio(foreground, background);
        assert.ok(ratio >= minimum, `${theme} ${name} has ${ratio.toFixed(2)}:1 contrast`);
      }
      console.log(
        `${theme} contrast: ` +
          samples
            .map(
              ([label, foreground, background]) =>
                `${label} ${contrastRatio(foreground, background).toFixed(2)}:1`,
            )
            .join(", "),
      );
    }
    await send("Runtime.enable");
    await send("Page.enable");
    await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
      const ok = data => Promise.resolve({ok:true,data});
      const columns = ['id','name','notes','json'].map((name,i)=>({name,dataType:i===3?'jsonb':'text',ordinal:i+1,isPk:i===0,notNull:i===0}));
      const records = Array.from({length:230},(_,i)=>({id:String(i+1),name:'Person '+(i+1),notes:i===0?null:'Note '+i,json:'{"id":9007199254740993,"active":true}'}));
      const wideColumns=Array.from({length:64},(_,i)=>({name:i===0?'id':'field_'+i,dataType:'text',ordinal:i+1,isPk:i===0,notNull:i===0}));
      const wideRecords=Array.from({length:1000},(_,r)=>Object.fromEntries(wideColumns.map((c,i)=>[c.name,i===0?String(r+1):'R'+(r+1)+' C'+i])));
      window.testCalls=[];
      localStorage.setItem("pgstudio:recent:local",JSON.stringify([{schema:"public",name:"people"}]));
      let savedSources=[{id:'local',name:'Local demo',host:'localhost',port:5432,database:'demo',user:'demo',hasSavedPassword:true}];
      window.api={
        listSources:()=>ok(savedSources),
        saveSource:({password,...source})=>{const id=source.id||'new-source';const previous=savedSources.find(s=>s.id===id);const saved={...source,id,hasSavedPassword:password===undefined?previous?.hasSavedPassword:!!password};savedSources=[...savedSources.filter(s=>s.id!==id),saved];return ok(saved)},
        testConnection:cfg=>{window.testConnectionInput=cfg;return ok({serverVersion:'PostgreSQL 17'})},
        connect:()=>{if(window.failNextConnect){window.failNextConnect=false;return Promise.resolve({ok:false,error:'Connection refused for test'})}return ok({database:'demo',host:'localhost',serverVersion:'PostgreSQL 17'})},
        disconnect:()=>ok(true),
        listTables:()=>ok([{schema:'public',name:'people',estRows:230},{schema:'public',name:'books',estRows:230},{schema:'public',name:'wide_grid',estRows:1000}]),
        tableColumns:(_s,t)=>ok({columns:t==='wide_grid'?wideColumns:columns,pk:['id']}),
        query:async(schema,table,opts)=>{
          window.testCalls.push({table,opts}); await new Promise(r=>setTimeout(r,30));
          if(opts.where==='bad') return {ok:false,error:'Invalid WHERE expression'};
          const data=table==='wide_grid'?wideRecords:records;
          return {ok:true,data:{columns:table==='wide_grid'?wideColumns:columns,pk:['id'],rows:data.slice(opts.offset,opts.offset+opts.limit),offset:opts.offset,hasMore:opts.offset+opts.limit<data.length,ms:12,previewSql:'SELECT * FROM public.'+table}};
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
    assert.equal(await evaluate(`document.querySelectorAll('.connection-card').length`), 1);
    assert.match(
      await evaluate(`document.querySelector('.welcome-content h1').textContent`),
      /Connect to PostgreSQL/,
    );
    await evaluate(`window.clickText=(text)=>{const el=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);if(!el)throw Error('Missing button: '+text);el.click()};
      window.protectsEdits=()=>!window.dispatchEvent(new Event('beforeunload',{cancelable:true}));
      window.key=(el,key,extra={})=>el.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,...extra}));
      window.setInput=(el,value)=>{Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}))};
      document.querySelector('.nrow.source').click()`);
    await delay(100);
    await evaluate(`document.querySelector('.nrow.table').click()`);
    await delay(150);
    assert.equal(
      await evaluate(`document.querySelector('.interactive-grid').getAttribute('aria-rowcount')`),
      "201",
    );
    assert.ok(await evaluate(`document.querySelectorAll('.grid-data-row').length < 60`));
    // Starring a table never opens it or queries rows, and all star controls agree.
    const queriesBeforeStar = await evaluate(`window.testCalls.length`);
    await evaluate(
      `document.querySelector('.nrow.table[title="public.books"] .favorite-button').click()`,
    );
    await waitFor(`!!document.querySelector('[aria-label="Favorites"] .shortcut-name')`);
    assert.equal(
      await evaluate(
        `document.querySelector('[aria-label="Favorites"] .shortcut-name').textContent`,
      ),
      "books",
    );
    assert.equal(
      await evaluate(`document.querySelector('[role="tab"][aria-selected="true"]').title`),
      "public.people",
    );
    assert.equal(await evaluate(`window.testCalls.length`), queriesBeforeStar);
    assert.deepEqual(
      await evaluate(`JSON.parse(localStorage.getItem('pgstudio:favorites:local'))`),
      [{ schema: "public", name: "books" }],
    );
    await evaluate(
      `document.querySelector('[aria-label="Favorites"] .favorite-button').focus();document.activeElement.click()`,
    );
    await waitFor(`!document.querySelector('[aria-label="Favorites"]')`);
    await waitFor(
      `document.activeElement.getAttribute('aria-label')==='Add public.books to favorites'`,
    );
    assert.equal(
      await evaluate(
        `document.querySelector('.nrow.table[title="public.books"] .favorite-button').getAttribute('aria-pressed')`,
      ),
      "false",
    );
    await evaluate(`document.querySelector('.table-tab.active .favorite-button').click()`);
    await waitFor(
      `document.querySelector('.nrow.table[title="public.people"] .favorite-button').getAttribute('aria-pressed')==='true'`,
    );
    assert.equal(
      await evaluate(
        `document.querySelector('[aria-label="Favorites"] .shortcut-name').textContent`,
      ),
      "people",
    );
    await evaluate(`document.querySelector('[aria-label="Favorites"] .shortcut-heading').click()`);
    await waitFor(`document.querySelector('#shortcut-list-favorites').hidden`);
    assert.equal(
      await evaluate(
        `JSON.parse(localStorage.getItem('pgstudio:sidebar-section:local:favorites'))`,
      ),
      false,
    );
    await evaluate(`document.querySelector('[aria-label="Favorites"] .shortcut-heading').click()`);
    await waitFor(`!document.querySelector('#shortcut-list-favorites').hidden`);
    await evaluate(`document.querySelector('.table-tab.active .favorite-button').click()`);
    await waitFor(`!document.querySelector('[aria-label="Favorites"]')`);
    assert.equal(await evaluate(`document.querySelector('[aria-label="Recent tables"]')`), null);
    // New workspace navigation is usable entirely from the keyboard.
    await evaluate(
      `document.querySelector('.interactive-grid').focus();key(document.querySelector('.interactive-grid'),'k',{ctrlKey:true})`,
    );
    await waitFor(`document.querySelectorAll('.quick-open-result').length===3`);
    assert.equal(await evaluate(`document.activeElement.getAttribute('role')`), "combobox");
    await evaluate(`key(document.activeElement,'ArrowDown')`);
    await waitFor(
      `document.activeElement.getAttribute('aria-activedescendant')==='quick-result-1'`,
    );
    await evaluate(`setInput(document.activeElement,'no-table-with-this-name')`);
    await waitFor(`document.querySelectorAll('.quick-open-result').length===0`);
    assert.equal(
      await evaluate(`document.activeElement.getAttribute('aria-activedescendant')`),
      null,
    );
    await evaluate(`key(document.activeElement,'Enter')`);
    assert.ok(await evaluate(`!!document.querySelector('.quick-open')`));
    await evaluate(`key(document.activeElement,'Escape')`);
    await waitFor(`!document.querySelector('.quick-open')`);
    assert.equal(await evaluate(`document.activeElement.className`), "interactive-grid");
    assert.equal(await evaluate(`document.querySelector('#table-filters').hidden`), true);
    await evaluate(`document.querySelector('.filter-toggle').click()`);
    await waitFor(
      `document.querySelector('.filter-toggle').getAttribute('aria-expanded')==='true' && !document.querySelector('#table-filters').hidden`,
    );
    await evaluate(`document.querySelector('.filter-toggle').click()`);
    await waitFor(`document.querySelector('#table-filters').hidden`);
    await evaluate(`document.querySelector('.source-menu').click()`);
    await waitFor(`!!document.querySelector('.ctx-menu')`);
    await evaluate(`key(document.activeElement,'Escape')`);
    await waitFor(`!document.querySelector('.ctx-menu')`);
    await evaluate(
      `const table=document.querySelector('.interactive-grid');table.focus();key(table,'ArrowRight');`,
    );
    await delay(40);
    await evaluate(`key(document.querySelector('.interactive-grid'),'Enter')`);
    await delay(40);
    await evaluate(`setInput(document.querySelector('.cell-input'),'Updated name')`);
    await delay(30);
    assert.ok(await evaluate(`protectsEdits()`), "An active cell draft blocks unload");
    await evaluate(`key(document.querySelector('.cell-input'),'Enter')`);
    await delay(80);
    assert.match(
      await evaluate(`document.querySelector('.pending-count').textContent`),
      /1 cell in 1 row/,
    );
    await evaluate(`document.querySelector('[aria-label="Undo"]').click()`);
    await delay(30);
    assert.equal(await evaluate(`document.querySelector('.pending-count')`), null);
    assert.equal(await evaluate(`protectsEdits()`), false, "A clean workspace allows unload");
    await evaluate(`document.querySelector('[aria-label="Redo"]').click()`);
    await delay(30);
    await evaluate(`document.querySelector('.table-tab.active .favorite-button').click()`);
    await waitFor(`!!document.querySelector('[aria-label="Favorites"]')`);
    await evaluate(
      `document.querySelector('.nrow.table[title="public.books"] .favorite-button').click()`,
    );
    await waitFor(
      `document.querySelectorAll('[aria-label="Favorites"] .shortcut-name').length===2`,
    );
    await evaluate(
      `[...document.querySelectorAll('.nrow.table')].find(e=>e.textContent.includes('books')).click()`,
    );
    await delay(100);
    assert.equal(await evaluate(`document.querySelectorAll('[role=tab]').length`), 2);
    assert.ok(await evaluate(`protectsEdits()`), "Unsaved edits in a background tab block unload");
    assert.deepEqual(
      await evaluate(
        `Array.from(document.querySelectorAll('[aria-label="Favorites"] .shortcut-name')).map(e=>e.textContent)`,
      ),
      ["people", "books"],
    );
    // Home/End selects tabs; opening favorites preserves edits and list order.
    await evaluate(
      `document.querySelector('[role="tab"][aria-selected="true"]').focus();key(document.activeElement,'Home')`,
    );
    await waitFor(
      `document.querySelector('[role="tab"][aria-selected="true"]').title==='public.people'`,
    );
    assert.equal(await evaluate(`document.activeElement.getAttribute('aria-selected')`), "true");
    await evaluate(`key(document.activeElement,'End')`);
    await waitFor(
      `document.querySelector('[role="tab"][aria-selected="true"]').title==='public.books'`,
    );
    await evaluate(
      `document.querySelector('[aria-label="Favorites"] [aria-label="Open public.people"]').click()`,
    );
    await delay(70);
    assert.match(await evaluate(`document.querySelector('.pending-count').textContent`), /1 cell/);
    assert.deepEqual(
      await evaluate(
        `Array.from(document.querySelectorAll('[aria-label="Favorites"] .shortcut-name')).map(e=>e.textContent)`,
      ),
      ["people", "books"],
    );
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
    assert.deepEqual(
      await evaluate(
        `[...document.querySelectorAll('.interactive-grid td.selected')].map(cell=>[...cell.classList].filter(name=>name.startsWith('range-')))`,
      ),
      [
        ["range-top", "range-left"],
        ["range-top", "range-right"],
        ["range-bottom", "range-left"],
        ["range-bottom", "range-right"],
      ],
    );
    await evaluate(`key(document.querySelector('.interactive-grid'),'c',{ctrlKey:true})`);
    await delay(30);
    assert.equal(await evaluate(`window.clipboardText`), "1\tPerson 1\n2\tPerson 2");
    const gridHeight = await evaluate(`document.querySelector('.grid-scroll').clientHeight`);
    await evaluate(
      `document.querySelector('.table-view-actions button').focus(); clickText('View SQL')`,
    );
    await delay(40);
    assert.equal(await evaluate(`document.querySelector('.grid-scroll').clientHeight`), gridHeight);
    await evaluate(`clickText('Copy SQL')`);
    await delay(30);
    assert.equal(
      await evaluate(`window.clipboardText`),
      await evaluate(`document.querySelector('.query-code').textContent`),
    );
    await evaluate(`key(document.activeElement, 'Escape')`);
    await delay(30);
    assert.equal(await evaluate(`document.querySelector('.query-dialog')`), null);
    assert.equal(await evaluate(`document.activeElement.textContent.trim()`), "View SQL");
    await evaluate(`clickText('Columns')`);
    await delay(30);
    assert.equal(await evaluate(`document.querySelector('.grid-scroll').clientHeight`), gridHeight);
    assert.equal(
      await evaluate(`document.activeElement.getAttribute('aria-label')`),
      "Find columns",
    );
    await evaluate(`setInput(document.activeElement,'missing-column')`);
    await delay(30);
    assert.equal(await evaluate(`document.querySelectorAll('.column-chooser input').length`), 0);
    assert.ok(await evaluate(`!!document.querySelector('.column-empty')`));
    await evaluate(`setInput(document.querySelector('.column-search'),'')`);
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
    assert.ok(
      await evaluate(`!!document.querySelector('[aria-label="Close inspector"].icon-btn svg')`),
    );
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

    // Virtualization must preserve logical coordinates, including navigation,
    // editing and copying cells that are outside the mounted window.
    await evaluate(`document.querySelector('.quick-open-trigger').click()`);
    await waitFor(`!!document.querySelector('.quick-open input')`);
    await evaluate(`setInput(document.querySelector('.quick-open input'),'wide_grid')`);
    await waitFor(`document.querySelectorAll('.quick-open-result').length===1`);
    await evaluate(`key(document.querySelector('.quick-open input'),'Enter')`);
    await waitFor(
      `document.querySelector('.table-heading').textContent.includes('wide_grid') && !document.querySelector('.query-feedback')`,
    );
    await evaluate(
      `const page=document.querySelector('select[aria-label="Page size"]');page.value='1000';page.dispatchEvent(new Event('change',{bubbles:true}))`,
    );
    await waitFor(
      `document.querySelector('.interactive-grid')?.getAttribute('aria-rowcount')==='1001' && !document.querySelector('.query-feedback')`,
    );
    assert.ok(await evaluate(`document.querySelectorAll('[role="gridcell"]').length < 2000`));
    await evaluate(
      `(()=>{const sc=document.querySelector('.grid-scroll');sc.scrollTop=sc.scrollHeight;sc.scrollLeft=sc.scrollWidth})()`,
    );
    await waitFor(`!!document.querySelector('[data-row="999"][data-col="63"]')`);
    assert.equal(
      await evaluate(`document.querySelector('[data-row="999"][data-col="63"]').textContent`),
      "R1000 C63",
    );
    await evaluate(
      `document.querySelector('[data-row="999"][data-col="63"]').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}))`,
    );
    await evaluate(
      `(async()=>{for(let i=0;i<45;i++){key(document.querySelector('.interactive-grid'),'ArrowUp');await new Promise(requestAnimationFrame)}for(let i=0;i<30;i++){key(document.querySelector('.interactive-grid'),'ArrowLeft');await new Promise(requestAnimationFrame)}})()`,
    );
    await waitFor(
      `document.querySelector('.interactive-grid').getAttribute('aria-activedescendant')==='cell-954-33' && !!document.querySelector('#cell-954-33')`,
    );
    await evaluate(`key(document.querySelector('.interactive-grid'),'Enter')`);
    await waitFor(`!!document.querySelector('.cell-input')`);
    await evaluate(`setInput(document.querySelector('.cell-input'),'Offscreen edit')`);
    await evaluate(
      `const scroll=document.querySelector('.grid-scroll');scroll.scrollTop=0;scroll.scrollLeft=0`,
    );
    await waitFor(`!!document.querySelector('#cell-0-0')`);
    assert.equal(await evaluate(`document.querySelector('.cell-input').value`), "Offscreen edit");
    await evaluate(`key(document.querySelector('.cell-input'),'Enter')`);
    await waitFor(`!!document.querySelector('.pending-count')`);
    assert.match(
      await evaluate(`document.querySelector('.pending-count').textContent`),
      /1 cell in 1 row/,
    );
    await evaluate(`document.querySelector('[aria-label="Undo"]').click()`);
    await waitFor(`!document.querySelector('.pending-count')`);
    await evaluate(`document.querySelector('[aria-label="Redo"]').click()`);
    await waitFor(`!!document.querySelector('.pending-count')`);
    await evaluate(`clickText('Revert all')`);
    await waitFor(`!document.querySelector('.pending-count')`);
    await evaluate(`key(document.querySelector('.interactive-grid'),'a',{ctrlKey:true})`);
    await delay(30);
    await evaluate(`key(document.querySelector('.interactive-grid'),'c',{ctrlKey:true})`);
    await delay(30);
    const copied = await evaluate(`window.clipboardText`);
    assert.equal(copied.split("\n").length, 1000);
    assert.equal(copied.split("\n")[999].split("\t").length, 64);
    assert.ok(copied.endsWith("R1000 C63"));

    await evaluate(`clickText('Columns')`);
    await delay(30);
    await evaluate(
      `document.querySelectorAll('.column-chooser > div')[63].querySelector('button').click()`,
    );
    await delay(50);
    await evaluate(`document.querySelector('.grid-scroll').scrollLeft=9000`);
    await waitFor(`!!document.querySelector('.interactive-grid td.pinned')`);
    const pinned = await evaluate(
      `(()=>{const cell=document.querySelector('.interactive-grid td.pinned'),sc=document.querySelector('.grid-scroll');return {name:document.querySelector('.interactive-grid th[aria-colindex="2"]').textContent,x:cell.getBoundingClientRect().left-sc.getBoundingClientRect().left}})()`,
    );
    assert.match(pinned.name, /field_63/);
    assert.ok(Math.abs(pinned.x - 40) < 2, "Pinned cell remains next to the gutter");
    await evaluate(`clickText('Reset columns')`);
    await delay(50);
    await evaluate(
      `document.querySelector('.grid-scroll').scrollLeft=0;document.querySelector('.grid-scroll').scrollTop=0`,
    );
    await waitFor(`!!document.querySelector('#cell-0-0')`);
    await evaluate(`clickText('Display settings')`);
    await delay(30);
    await evaluate(
      `const opts=document.querySelectorAll('.settings-form select');opts[1].value='comfortable';opts[1].dispatchEvent(new Event('change',{bubbles:true}))`,
    );
    await delay(40);
    await evaluate(
      `const size=document.querySelectorAll('.settings-form select')[2];size.value='18';size.dispatchEvent(new Event('change',{bubbles:true}))`,
    );
    await delay(50);
    await evaluate(`clickText('Done')`);
    await delay(50);
    await evaluate(
      `(()=>{const sc=document.querySelector('.grid-scroll');sc.scrollTop=sc.scrollHeight})()`,
    );
    await waitFor(`!!document.querySelector('#cell-999-0')`);
    const last = await evaluate(
      `(()=>{const sc=document.querySelector('.grid-scroll'),last=document.querySelector('#cell-999-0');return {bottom:last.getBoundingClientRect().bottom,viewport:sc.getBoundingClientRect().bottom,rows:document.querySelectorAll('.grid-data-row').length}})()`,
    );
    assert.ok(
      last.bottom <= last.viewport + 1 && last.bottom > last.viewport - 60,
      "Last row stays aligned after density and font changes",
    );
    assert.ok(last.rows < 60);
    // Light mode and both explicit/system reduced-motion settings stay usable.
    await evaluate(`clickText('Display settings')`);
    await waitFor(`!!document.querySelector('.settings-form')`);
    await evaluate(
      `(()=>{const selects=document.querySelectorAll('.settings-form select');selects[0].value='light';selects[0].dispatchEvent(new Event('change',{bubbles:true}));selects[3].value='reduced';selects[3].dispatchEvent(new Event('change',{bubbles:true}))})()`,
    );
    await waitFor(
      `document.documentElement.dataset.theme==='light' && document.documentElement.dataset.motion==='reduced'`,
    );
    assert.equal(
      await evaluate(`getComputedStyle(document.querySelector('.modal')).animationName`),
      "none",
    );
    await evaluate(`clickText('Done')`);
    await delay(50);
    await evaluate(`document.querySelector('.quick-open-trigger').click()`);
    await waitFor(`!!document.querySelector('.quick-open')`);
    assert.equal(
      await evaluate(`getComputedStyle(document.querySelector('.quick-open')).animationName`),
      "none",
    );
    await waitFor(`!!document.querySelector('.quick-open-result[aria-selected="true"]')`);
    await checkContrast("Light");
    await evaluate(`key(document.activeElement,'Escape')`);
    await waitFor(`!document.querySelector('.quick-open')`);
    await evaluate(`clickText('Display settings')`);
    await waitFor(`!!document.querySelector('.settings-form')`);
    await evaluate(
      `(()=>{const selects=document.querySelectorAll('.settings-form select');selects[0].value='dark';selects[0].dispatchEvent(new Event('change',{bubbles:true}));selects[3].value='auto';selects[3].dispatchEvent(new Event('change',{bubbles:true}))})()`,
    );
    await evaluate(`clickText('Done')`);
    await delay(50);
    await send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    await evaluate(`document.querySelector('.quick-open-trigger').click()`);
    await waitFor(`!!document.querySelector('.quick-open')`);
    assert.equal(
      await evaluate(`getComputedStyle(document.querySelector('.quick-open')).animationName`),
      "none",
    );
    await waitFor(`!!document.querySelector('.quick-open-result[aria-selected="true"]')`);
    await checkContrast("Dark");
    await evaluate(`key(document.activeElement,'Escape')`);
    await send("Emulation.setEmulatedMedia", { features: [] });
    // Failed connections keep the form, exact error and edited values available.
    await evaluate(`document.querySelector('.source-menu').click()`);
    await waitFor(`!!document.querySelector('.ctx-menu')`);
    await evaluate(`clickText('Edit…')`);
    await waitFor(`!!document.querySelector('#srcName')`);
    assert.equal(await evaluate(`document.querySelector('#srcPassword').value`), "");
    assert.equal(
      await evaluate(`document.querySelector('#srcPassword').placeholder`),
      "Saved password",
    );
    await evaluate(
      `[...document.querySelectorAll('.checkbox-row')].find(el=>el.textContent.includes('verify server identity')).querySelector('input').click()`,
    );
    await waitFor(`!!document.querySelector('#srcSslCa')`);
    await evaluate(
      `setInput(document.querySelector('#srcSslCa'),'sample private CA');clickText('Test')`,
    );
    await waitFor(`!!window.testConnectionInput`);
    assert.deepEqual(
      await evaluate(
        `(({id, password, ssl, sslCa})=>[id,password??null,ssl,sslCa])(window.testConnectionInput)`,
      ),
      ["local", null, true, "sample private CA"],
    );
    await waitFor(
      `[...document.querySelectorAll('button')].some(el=>el.textContent.trim()==='Connect' && !el.disabled)`,
    );
    await evaluate(`window.failNextConnect=true;clickText('Connect')`);
    await waitFor(`!!document.querySelector('.connect-error')`);
    assert.match(
      await evaluate(`document.querySelector('.connect-error').textContent`),
      /Connection refused/,
    );
    assert.equal(await evaluate(`document.querySelector('#srcName').value`), "Local demo");
    assert.ok(await evaluate(`!!document.querySelector('.ndot.connected')`));
    await evaluate(`clickText('Cancel')`);
    await waitFor(`!document.querySelector('[aria-modal="true"]')`);
    assert.equal(await evaluate(`document.querySelectorAll('.nrow.source').length`), 1);
    // Retrying a newly saved connection must reuse its ID, not duplicate it.
    await evaluate(`document.querySelector('[aria-label="New data source"]').click()`);
    await waitFor(`!!document.querySelector('#srcName')`);
    await evaluate(
      `setInput(document.querySelector('#srcName'),'Retry demo');setInput(document.querySelector('#srcDatabase'),'demo');setInput(document.querySelector('#srcUser'),'demo')`,
    );
    await delay(30);
    await evaluate(`window.failNextConnect=true;clickText('Connect')`);
    await waitFor(`!!document.querySelector('.connect-error')`);
    assert.equal(await evaluate(`document.querySelectorAll('.nrow.source').length`), 2);
    await evaluate(`clickText('Connect')`);
    await waitFor(
      `!document.querySelector('[aria-modal="true"]') && !!document.querySelector('.welcome-content')`,
    );
    assert.equal(await evaluate(`document.querySelectorAll('.nrow.source').length`), 2);
    await evaluate(`document.querySelector('.welcome-actions .btn.primary').click()`);
    await waitFor(`!!document.querySelector('.quick-open input')`);
    await evaluate(`setInput(document.querySelector('.quick-open input'),'wide_grid')`);
    await waitFor(`document.querySelectorAll('.quick-open-result').length===1`);
    await evaluate(`key(document.querySelector('.quick-open input'),'Enter')`);
    await waitFor(
      `!!document.querySelector('.interactive-grid') && !document.querySelector('.query-feedback')`,
    );
    await evaluate(`clickText('Display settings')`);
    await waitFor(`!!document.querySelector('.settings-form')`);
    await evaluate(
      `(()=>{const selects=document.querySelectorAll('.settings-form select');selects[1].value='compact';selects[1].dispatchEvent(new Event('change',{bubbles:true}));selects[2].value='12';selects[2].dispatchEvent(new Event('change',{bubbles:true}))})()`,
    );
    await evaluate(`clickText('Done')`);
    await send("Emulation.setDeviceMetricsOverride", {
      width: 900,
      height: 560,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await delay(100);
    assert.ok(
      await evaluate(`document.documentElement.scrollWidth <= innerWidth`),
      "Workspace fits the minimum desktop width",
    );
    assert.ok(
      await evaluate(`document.querySelector('.grid-scroll').clientHeight >= 100`),
      "Grid stays usable at the minimum desktop height",
    );
    await send("Emulation.clearDeviceMetricsOverride");
    await delay(100);
    // Closing a tab from the keyboard moves focus to its surviving neighbor.
    await evaluate(`document.querySelector('.nrow.table[title="public.people"]').click()`);
    await waitFor(
      `document.querySelectorAll('[role="tab"]').length===2 && document.querySelector('.table-heading h1').textContent==='people'`,
    );
    await evaluate(
      `document.querySelector('[role="tab"][aria-selected="true"]').focus();key(document.activeElement,'Delete')`,
    );
    await waitFor(
      `document.querySelectorAll('[role="tab"]').length===1 && document.activeElement.getAttribute('role')==='tab' && document.activeElement.getAttribute('aria-selected')==='true'`,
    );
    const screenshot = await send("Page.captureScreenshot", { format: "png" });
    const screenshotPath = path.join(os.tmpdir(), "pgstudio-ui-smoke.png");
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
    assert.deepEqual(errors, []);
    console.log(
      "UI smoke passed: editing, history, tabs, review, TSV, columns, inspector, theme, pagination, count; virtualization; welcome, quick-open keyboard/focus, filter panel, connection actions/failure, light/dark themes and reduced motion; favorite synchronization/persistence and stable ordering/collapse, no redundant recents, tab keyboard navigation and close focus.",
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
