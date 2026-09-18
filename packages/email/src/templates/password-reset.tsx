import { ActionEmail, ActionEmailText } from "../components/action-email.js";

export type PasswordResetEmailProps = {
  resetUrl: string;
};

export const PreviewProps = {
  resetUrl: "http://localhost:30000/login?mode=reset#token=preview-token",
} satisfies PasswordResetEmailProps;

export function PasswordResetEmail({ resetUrl }: PasswordResetEmailProps) {
  return (
    <ActionEmail actionLabel="Reset password" heading="Reset your password" preview="Reset your Parcelis password" url={resetUrl}>
      <ActionEmailText>
        We received a request to reset your Parcelis password.
      </ActionEmailText>
      <ActionEmailText>
        If you did not request a password reset, you can safely ignore this email.
      </ActionEmailText>
    </ActionEmail>
  );
}

export default PasswordResetEmail;
