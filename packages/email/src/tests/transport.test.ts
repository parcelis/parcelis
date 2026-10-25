import assert from "node:assert/strict";
import { createServer, type Socket } from "node:net";
import { once } from "node:events";
import test, { type TestContext } from "node:test";
import nodemailer, { type Transporter } from "nodemailer";
import { verifyEmailTransport } from "../transport.js";

function configure(t: TestContext, port = "2525") {
  for (const [key, value] of Object.entries({
    EMAIL_FROM: "status@example.test",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: port,
    SMTP_SECURE: "false",
    SMTP_USER: "status",
    SMTP_PASSWORD: "test-password",
  })) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
}

test("SMTP verification rejects a hanging verify and releases transport resources", async (t) => {
  configure(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const close = t.mock.fn();
  t.mock.method(
    nodemailer,
    "createTransport",
    () =>
      ({
        verify: () => new Promise(() => {}),
        close,
      }) as unknown as Transporter,
  );
  const verification = assert.rejects(verifyEmailTransport(100), /SMTP verification timed out/);
  t.mock.timers.tick(100);
  await verification;
  assert.equal(close.mock.callCount(), 1);
});

test("SMTP verification clears its deadline after success", async (t) => {
  configure(t);
  const clear = t.mock.method(globalThis, "clearTimeout");
  const close = t.mock.fn();
  t.mock.method(
    nodemailer,
    "createTransport",
    () =>
      ({
        verify: async () => true,
        close,
      }) as unknown as Transporter,
  );
  await verifyEmailTransport(100);
  assert.equal(clear.mock.callCount(), 1);
  assert.ok(clear.mock.calls[0]?.arguments[0]);
  assert.equal(close.mock.callCount(), 1);
});

for (const secure of [false, true])
  test(
    `SMTP deadline destroys the ${secure ? "implicit TLS" : "multi-phase SMTP"} socket`,
    { timeout: 3_000 },
    async (t) => {
      const sockets = new Set<Socket>();
      const received: Buffer[] = [];
      const server = createServer((socket) => {
        socket.on("data", (data: Buffer) => received.push(data));
        sockets.add(socket);
        socket.on("error", () => {});
        socket.once("close", () => sockets.delete(socket));
        if (!secure) {
          const greeting = setTimeout(() => socket.write("220 smtp.test ready\r\n"), 60);
          socket.once("close", () => clearTimeout(greeting));
        }
      });
      t.after(() => {
        for (const socket of sockets) socket.destroy();
        server.close();
      });
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      configure(t, String(address.port));
      process.env.SMTP_SECURE = String(secure);
      const connected = once(server, "connection");
      const verification = assert.rejects(verifyEmailTransport(150), /timed out/i);
      const [socket] = await connected;
      const closed = once(socket, "close");
      await verification;
      await closed;
      assert.equal(sockets.size, 0);
      if (secure) assert.equal(received[0]?.[0], 22);
      else assert.match(Buffer.concat(received).toString(), /^EHLO /);
    },
  );
