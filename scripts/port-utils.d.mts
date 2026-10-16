export function isPortOpen(port: number): Promise<boolean>;
export function findOpenPort(preferredPort: number | string, reservedPorts?: Set<number>): Promise<number>;
