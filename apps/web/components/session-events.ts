export const sessionChannelName = "parcelis-session";
export const sessionExpiredEventName = "parcelis:session-expired";
export const sessionUserActivityEventName = "parcelis:user-activity";

export function broadcastSessionLogout() {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(sessionChannelName);
  channel.postMessage({ type: "logout" });
  channel.close();
}
