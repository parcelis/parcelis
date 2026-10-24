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
import { checkStorage, probeQueueJob } from "../../modules/service-checks";

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

test("a stalled storage upload still attempts bounded cleanup and releases its clients", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const started = deferred<void>();
  const destroy = t.mock.method(S3Client.prototype, "destroy", () => {});
  const send = t.mock.method(S3Client.prototype, "send", async () => ({}));
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
  await outcome;
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
    if (stalled === "remove") assert.deepEqual(result.value, { ok: true });
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

test("a real canary connection is torn down when Redis accepts a socket but never responds", async (t) => {
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
    probeQueueJob("health-test", "test", 100, undefined, (name) => {
      const queue = new Queue(name, {
        connection: {
          host: "127.0.0.1",
          port: address.port,
          connectTimeout: 50,
          commandTimeout: 50,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 0,
          retryStrategy: () => null,
        },
      });
      queue.on("error", () => {});
      return queue;
    }),
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
});
