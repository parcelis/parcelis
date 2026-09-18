import { ActionEmail, ActionEmailText } from "../components/action-email.js";

export type AccountVerificationEmailProps = {
  verificationUrl: string;
};

export const PreviewProps = {
  verificationUrl: "http://localhost:30000/login?mode=verify#token=preview-token",
} satisfies AccountVerificationEmailProps;

export function AccountVerificationEmail({ verificationUrl }: AccountVerificationEmailProps) {
  return (
    <ActionEmail actionLabel="Verify email" heading="Verify your email" preview="Verify your Parcelis email" url={verificationUrl}>
      <ActionEmailText>
        Confirm your email address to activate your Parcelis account.
      </ActionEmailText>
      <ActionEmailText>
        This link expires in 24 hours. If you did not create this account, you can safely ignore this email.
      </ActionEmailText>
    </ActionEmail>
  );
}

export default AccountVerificationEmail;
