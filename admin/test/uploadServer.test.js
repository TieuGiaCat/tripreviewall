require("./helpers");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const Module = require("module");

// Fake "sharp": counts how many times a resize actually runs.
let resizeCalls = 0;
const fakeSharp = () => {
  const chain = {
    rotate: () => chain, resize: () => chain, webp: () => chain,
    toFile: async (out) => { resizeCalls++; await new Promise((r) => setTimeout(r, 50)); fs.writeFileSync(out, "WEBP"); },
  };
  return chain;
};
const realLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "sharp") return fakeSharp;
  return realLoad.call(this, request, ...rest);
};
const { createUploadServer } = require("../src/lib/uploadServer");

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uploads-"));
  fs.mkdirSync(path.join(dir, "tours"));
  fs.writeFileSync(path.join(dir, "tours", "a.jpg"), "JPEGDATA");
  const { serveUpload } = createUploadServer(dir);
  const server = http.createServer((req, res) => serveUpload(req, res, req.url.split("?")[0]));
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ dir, server, port: server.address().port })));
}

function get(port, p, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port, path: p, headers }, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on("error", reject);
  });
}

test("original file is served with ETag, then 304 when unchanged (E6)", async () => {
  const { server, port } = await setup();
  try {
    const first = await get(port, "/uploads/tours/a.jpg");
    assert.equal(first.status, 200);
    assert.equal(first.body, "JPEGDATA");
    assert.ok(first.headers.etag);
    const second = await get(port, "/uploads/tours/a.jpg", { "If-None-Match": first.headers.etag });
    assert.equal(second.status, 304);
  } finally { server.close(); }
});

test("10 parallel requests for a new size resize only once (E6)", async () => {
  const { server, port } = await setup();
  resizeCalls = 0;
  try {
    const results = await Promise.all(Array.from({ length: 10 }, () => get(port, "/uploads/tours/a.jpg?w=400")));
    results.forEach((r) => { assert.equal(r.status, 200); assert.equal(r.body, "WEBP"); assert.equal(r.headers["content-type"], "image/webp"); });
    assert.equal(resizeCalls, 1);
    await get(port, "/uploads/tours/a.jpg?w=400");
    assert.equal(resizeCalls, 1, "cached copy is reused");
  } finally { server.close(); }
});

test("path traversal and the cache folder are refused", async () => {
  const { server, port } = await setup();
  try {
    assert.equal((await get(port, "/uploads/%2e%2e/%2e%2e/etc/passwd")).status, 403);
    assert.equal((await get(port, "/uploads/.resized/w400/tours/a.jpg.webp")).status, 403);
    assert.equal((await get(port, "/uploads/tours/missing.jpg")).status, 404);
  } finally { server.close(); }
});
