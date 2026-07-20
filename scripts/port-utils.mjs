import net from "node:net";

export async function isPortOpen(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        resolve(false);
        return;
      }

      reject(error);
    });
    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port);
  });
}

export async function findOpenPort(preferredPort) {
  let port = Number(preferredPort);

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid preferred port: ${preferredPort}`);
  }

  while (!(await isPortOpen(port))) {
    port += 1;

    if (port > 65535) {
      throw new Error(`No open port found at or above ${preferredPort}`);
    }
  }

  return port;
}
