import { bugReportDestination, bugReportFormSchema, userRoleValues } from "@parcelis/schemas";
import { getOrganizationEmailConfig, sendEmail } from "@parcelis/email";
import { TRPCError } from "@trpc/server";
import { consumeEmailSendRateLimit } from "../modules/login-rate-limit";
import { organizationProcedure, router } from "./trpc";

function isImage(buffer: Buffer, type: string) {
  if (type === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === "image/jpeg") return buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  return (
    type === "image/webp" && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP"
  );
}

export const bugReportsRouter = router({
  submit: organizationProcedure
    .use(({ ctx, next }) => {
      if (ctx.user.accountStatus !== "active" || !userRoleValues.includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only active staff can report a problem." });
      }
      consumeEmailSendRateLimit(`bug-report:${ctx.user.id}`);
      return next();
    })
    .input(bugReportFormSchema)
    .mutation(async ({ ctx, input }) => {
      const attachments = await Promise.all(
        input.screenshots.map(async (file, index) => {
          const content = Buffer.from(await file.arrayBuffer());
          if (!isImage(content, file.type)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "A screenshot is not a valid PNG, JPEG, or WebP image.",
            });
          }
          const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
          return { content, contentType: file.type, filename: `screenshot-${index + 1}.${extension}` };
        }),
      );
      const text = [
        "Parcelis bug report",
        "",
        input.description,
        ...(input.pageUrl ? ["", `Page: ${input.pageUrl}`] : []),
        ...(input.browserVersion ? ["", `Browser: ${input.browserVersion}`] : []),
        ...(input.appVersion ? ["", `App version: ${input.appVersion}`] : []),
      ].join("\n");
      try {
        const emailConfig = await getOrganizationEmailConfig(ctx.prisma, ctx.organization.organizationId);
        await sendEmail({
          to: bugReportDestination,
          subject: "Parcelis bug report",
          text,
          html: `<pre>${text.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!)}</pre>`,
          attachments,
          emailConfig,
        });
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Your report could not be sent. Try again, or ask your administrator to check outgoing email settings.",
        });
      }
      return { sent: true as const };
    }),
});
