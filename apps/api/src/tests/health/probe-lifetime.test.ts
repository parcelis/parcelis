import { deferred } from "./deferred";
import assert from "node:assert/strict";
import { setImmediate as nextTurn } from "node:timers/promises";
import test from "node:test";
import { S3Client } from "@aws-sdk/client-s3";
import type { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Queue } from "bullmq";
import { createServer } from "node:net";
import type { Socket } from "node:net";
import { once } from "node:events";
import { checkStorage, createCanaryQueue, probeQueueJob } from "../../modules/service-checks";

for (const signingCall of [1, 2]) {
  test(`stalled storage signing call ${signingCall} releases both clients and cannot start a late upload`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const started = deferred<void>();
    const pending = deferred<string>();
    const destroy = t.mock.method(S3Client.prototype, "destroy", () => {});
    const fetch = t.mock.method(globalThis, "fetch", async () => {
      throw new Error("Unexpected upload");
    });
    let calls = 0;
    const sign: typeof getSignedUrl = async () => {
      if (++calls === signingCall) {
        started.resolve();
        return pending.promise;
      }
      return "signed-url";
    };
    const outcome = assert.rejects(checkStorage(true, sign), /deadline/);
    await started.promise;
    t.mock.timers.tick(3_001);
    await outcome;
    assert.equal(destroy.mock.callCount(), 2);
    pending.resolve("late-url");
    await nextTurn();
    assert.equal(fetch.mock.callCount(), 0);
    assert.equal(calls, signingCall);
  });
}

test("a stalled storage upload and delete finish within their budgets and release both clients", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const started = deferred<void>();
  const deleting = deferred<void>();
  const destroy = t.mock.method(S3Client.prototype, "destroy", () => {});
  const send = t.mock.method(S3Client.prototype, "send", async () => {
    deleting.resolve();
    return new Promise(() => {});
  });
  t.mock.method(globalThis, "fetch", async () => {
    started.resolve();
    return new Promise<Response>(() => {});
  });
  const outcome = assert.rejects(
    checkStorage(true, async () => "signed-url"),
    /deadline/,
  );
  await started.promise;
  t.mock.timers.tick(3_001);
  await deleting.promise;
  assert.equal(destroy.mock.callCount(), 0);
  const cleanupSignal = send.mock.calls[0]!.arguments[1]!.abortSignal;
  assert.equal(cleanupSignal?.aborted, false);
  t.mock.timers.tick(1_501);
  await outcome;
  assert.equal(cleanupSignal?.aborted, true);
  assert.equal(send.mock.callCount(), 1);
  assert.equal(destroy.mock.callCount(), 2);
});

for (const stalled of ["add", "state", "result", "remove", "close"]) {
  test(`canary ${stalled} operations cannot outlive their work/cleanup budget`, async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const started = deferred<void>();
    const pending = deferred<never>();
    const calls: string[] = [];
    const step = async <T>(stage: string, value: T): Promise<T> => {
      calls.push(stage);
      if (stage === stalled) {
        started.resolve();
        return pending.promise;
      }
      return value;
    };
    const job = { id: "canary", getState: () => step("state", "completed") };
    let jobId: string | undefined;
    const queue = {
      add: (_name: string, _data: unknown, options: { jobId: string }) => {
        jobId = options.jobId;
        return step("add", job);
      },
      getJob: () => step("result", { returnvalue: { ok: true } }),
      remove: (id: string) => {
        assert.equal(id, jobId);
        return step("remove", 1);
      },
      getBackend: () => ({
        close: (force: boolean) => {
          assert.equal(force, true);
          return step("close", undefined);
        },
      }),
    } as unknown as Queue;
    const outcome = probeQueueJob("test-queue", "test-job", 1_000, undefined, () => queue).then(
      (value) => ({ value, error: undefined }),
      (error: Error) => ({ value: undefined, error }),
    );
    await started.promise;
    t.mock.timers.tick(["remove", "close"].includes(stalled) ? 201 : 1_001);
    const result = await outcome;
    assert.ok(calls.includes("remove"));
    assert.ok(calls.includes("close"));
    if (["remove", "close"].includes(stalled)) assert.deepEqual(result.value, { ok: true });
    else assert.match(result.error?.message ?? "", /deadline/);
    if (stalled === "add") assert.ok(!calls.includes("state"));
    if (stalled === "state") assert.ok(!calls.includes("result"));
  });
}

test("a parent probe cancellation stops canary polling and force-closes its private queue", async () => {
  const started = deferred<void>();
  const controller = new AbortController();
  let closed = false;
  const queue = {
    add: async () => ({
      getState: async () => {
        started.resolve();
        return new Promise<string>(() => {});
      },
    }),
    remove: async () => 1,
    getBackend: () => ({
      close: async () => {
        closed = true;
      },
    }),
  } as unknown as Queue;
  const outcome = assert.rejects(
    probeQueueJob("queue", "job", 1_500, controller.signal, () => queue),
    /cancelled/,
  );
  await started.promise;
  controller.abort(new Error("cancelled"));
  await outcome;
  assert.ok(closed);
});

test("a late add result cannot resume polling or replace the original probe failure", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const started = deferred<void>();
  const added = deferred<{ getState: () => Promise<string> }>();
  let states = 0;
  let removed = 0;
  let closed = 0;
  const queue = {
    add: () => {
      started.resolve();
      return added.promise;
    },
    remove: async () => ++removed,
    getBackend: () => ({
      close: async () => {
        closed++;
        throw new Error("Cleanup failed");
      },
    }),
  } as unknown as Queue;
  const outcome = assert.rejects(
    probeQueueJob("queue", "job", 100, undefined, () => queue),
    /Probe deadline exceeded/,
  );
  await started.promise;
  t.mock.timers.tick(101);
  await outcome;
  added.resolve({
    getState: async () => {
      states++;
      return "completed";
    },
  });
  await nextTurn();
  assert.equal(states, 0);
  assert.equal(removed, 1);
  assert.equal(closed, 1);
});

test(
  "a real canary connection is torn down when Redis accepts a socket but never responds",
  { timeout: 3_000 },
  async (t) => {
    const sockets = new Set<Socket>();
    const accepted = deferred<void>();
    const disconnected = deferred<void>();
    const server = createServer((socket) => {
      sockets.add(socket);
      accepted.resolve();
      socket.on("close", () => {
        sockets.delete(socket);
        disconnected.resolve();
      });
      socket.resume();
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => {
      for (const socket of sockets) socket.destroy();
      server.close();
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const outcome = assert.rejects(
      probeQueueJob("health-test", "test", 100, undefined, (name, waitMs) =>
        createCanaryQueue(name, waitMs, { host: "127.0.0.1", port: address.port }),
      ),
    );
    await accepted.promise;
    await outcome;
    const timer = setTimeout(() => disconnected.reject(new Error("Canary socket was not closed")), 1_000);
    try {
      await disconnected.promise;
    } finally {
      clearTimeout(timer);
    }
    assert.equal(sockets.size, 0);
  },
);

test(
  "stalled Redis Lua calls are disconnected without reconnecting after canary cleanup",
  { timeout: 3_000 },
  async (t) => {
    const sockets = new Set<Socket>();
    const disconnected = deferred<void>();
    const commands: string[] = [];
    const server = createServer((socket) => {
      sockets.add(socket);
      let buffered = Buffer.alloc(0);
      socket.on("data", (chunk) => {
        buffered = Buffer.concat([buffered, chunk]);
        while (buffered.length) {
          const header = buffered.indexOf("\r\n");
          if (header < 0) return;
          const count = Number(buffered.subarray(1, header));
          const args: Buffer[] = [];
          let offset = header + 2;
          for (let index = 0; index < count; index++) {
            const end = buffered.indexOf("\r\n", offset);
            if (end < 0) return;
            const length = Number(buffered.subarray(offset + 1, end));
            if (buffered.length < end + 2 + length + 2) return;
            args.push(buffered.subarray(end + 2, end + 2 + length));
            offset = end + 2 + length + 2;
          }
          buffered = buffered.subarray(offset);
          const command = args[0]!.toString().toLowerCase();
          commands.push(command);
          if (command === "evalsha" || command === "eval") continue;
          if (command === "info") {
            const info = "redis_version:7.2.0\r\nmaxmemory_policy:noeviction\r\n";
            socket.write(`$${Buffer.byteLength(info)}\r\n${info}\r\n`);
          } else socket.write("+OK\r\n");
        }
      });
      socket.on("close", () => {
        sockets.delete(socket);
        disconnected.resolve();
      });
    });
    t.after(() => {
      for (const socket of sockets) socket.destroy();
      server.close();
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    await assert.rejects(
      probeQueueJob("health-test", "test", 100, undefined, (name, waitMs) =>
        createCanaryQueue(name, waitMs, { host: "127.0.0.1", port: address.port }),
      ),
    );
    await disconnected.promise;
    assert.ok(
      commands.filter((command) => command === "evalsha" || command === "eval").length >= 2,
      JSON.stringify(commands),
    );
    const commandCount = commands.length;
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(commands.length, commandCount);
    assert.equal(sockets.size, 0);
  },
);
