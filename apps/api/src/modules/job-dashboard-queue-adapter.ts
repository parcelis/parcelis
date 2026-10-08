import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { sanitizeJobData } from "./job-dashboard-redaction";

export class JobDashboardBullMQAdapter extends BullMQAdapter {
  constructor(queue: ConstructorParameters<typeof BullMQAdapter>[0]) {
    super(queue);
    this.setFormatter("data", sanitizeJobData);
    this.setFormatter("progress", () => "[redacted]");
    this.setFormatter("returnValue", () => "[redacted]");
  }
}
