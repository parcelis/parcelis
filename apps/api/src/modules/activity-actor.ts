import { AsyncLocalStorage } from "node:async_hooks";

type ActivityActor = { id: string | number; name: string };

const activityActor = new AsyncLocalStorage<ActivityActor>();

export function withActivityActor<T>(actor: ActivityActor, operation: () => T): T {
  return activityActor.run(actor, operation);
}

export function getActivityActor() {
  return activityActor.getStore();
}
