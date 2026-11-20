const { test } = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { loader } = require("./load.cjs");

const bastion = { target: "i-00ea5db1a5097f6c3", profile: "farmdesk", region: "eu-west-1" };

// A stand-in for the AWS CLI. `behaviour` decides what the fake process does
// with the local port it was asked to forward.
function fakeSpawn(behaviour) {
  const calls = [];
  const spawn = (cmd, args, opts) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.killed = false;
    child.kill = () => {
      child.killed = true;
      child.server?.close();
      setImmediate(() => child.emit("exit", null));
      return true;
    };
    const params = JSON.parse(args[args.indexOf("--parameters") + 1]);
    calls.push({ cmd, args, opts, params, child });
    setImmediate(() => behaviour(child, Number(params.localPortNumber[0])));
    return child;
  };
  return { spawn, calls };
}

const listens = (child, port) => {
  child.server = net.createServer((s) => s.destroy()).listen(port, "127.0.0.1");
};

const deniedAfterStart = (child) => {
  child.stderr.write(
    "An error occurred (AccessDeniedException) when calling the StartSession operation: not authorized",
  );
  child.emit("exit", 254);
};

function tunnelModule(spawn) {
  return loader({ child_process: { spawn } })("src/main/tunnel.ts");
}

test("forwards the remote host through the bastion with the CLI's own flags", async () => {
  const fake = fakeSpawn(listens);
  const { openTunnel } = tunnelModule(fake.spawn);
  const t = await openTunnel(bastion, "db.internal.example", 5432);
  const { cmd, args, params, opts } = fake.calls[0];
  assert.equal(cmd, "aws");
  assert.deepEqual(args.slice(0, 2), ["ssm", "start-session"]);
  assert.equal(args[args.indexOf("--target") + 1], "i-00ea5db1a5097f6c3");
  assert.equal(args[args.indexOf("--profile") + 1], "farmdesk");
  assert.equal(
    args[args.indexOf("--document-name") + 1],
    "AWS-StartPortForwardingSessionToRemoteHost",
  );
  assert.deepEqual(params.host, ["db.internal.example"]);
  assert.deepEqual(params.portNumber, ["5432"]);
  assert.equal(params.localPortNumber[0], String(t.localPort));
  assert.match(opts.env.PATH, /\/opt\/homebrew\/bin/);
  t.close();
  assert.equal(fake.calls[0].child.killed, true);
});

test("an empty profile leaves the CLI on its default credential chain", () => {
  const { ssmArgs } = tunnelModule(() => {});
  assert.equal(ssmArgs({ ...bastion, profile: "" }, "h", 5432, 6000).includes("--profile"), false);
});

test("a refused session surfaces the IAM reason instead of a timeout", async () => {
  const { openTunnel } = tunnelModule(fakeSpawn(deniedAfterStart).spawn);
  await assert.rejects(
    openTunnel(bastion, "h", 5432),
    /bastion's access policy[\s\S]*AccessDenied/,
  );
});

test("a missing AWS CLI is reported as such", async () => {
  const spawn = () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => true;
    setImmediate(() => child.emit("error", new Error("spawn aws ENOENT")));
    return child;
  };
  const { openTunnel } = tunnelModule(spawn);
  await assert.rejects(openTunnel(bastion, "h", 5432), /`aws`\) was not found/);
});

test("bad bastion settings are rejected before anything is spawned", async () => {
  const fake = fakeSpawn(listens);
  const { openTunnel } = tunnelModule(fake.spawn);
  await assert.rejects(
    openTunnel({ ...bastion, target: "bastion; rm -rf /" }, "h", 5432),
    /instance id/,
  );
  await assert.rejects(openTunnel({ ...bastion, region: "europe" }, "h", 5432), /Region/);
  assert.equal(fake.calls.length, 0);
});

test("closeAllTunnels kills every open forward", async () => {
  const fake = fakeSpawn(listens);
  const { openTunnel, closeAllTunnels } = tunnelModule(fake.spawn);
  await openTunnel(bastion, "a", 5432);
  await openTunnel(bastion, "b", 5432);
  closeAllTunnels();
  assert.deepEqual(
    fake.calls.map((c) => c.child.killed),
    [true, true],
  );
});

test("PATH additions don't duplicate entries already present", () => {
  const { cliPath } = tunnelModule(() => {});
  const p = cliPath("/usr/bin:/opt/homebrew/bin").split(":");
  assert.equal(p.filter((x) => x === "/opt/homebrew/bin").length, 1);
  assert.equal(p[0], "/usr/bin");
});
