export const sessionChannelName = "parcelis-session";
export const sessionExpiredEventName = "parcelis:session-expired";

export function broadcastSessionLogout() {
  const channel = new BroadcastChannel(sessionChannelName);
  channel.postMessage({ type: "logout" });
  channel.close();
}
