import { Button, Heading, Link, Text } from "react-email";
import { EmailLayout } from "../components/email-layout.js";
import { emailColors } from "../styles.js";

export type PasswordResetEmailProps = {
  resetUrl: string;
};

export const PreviewProps = {
  resetUrl: "http://localhost:30000/reset-password?token=preview-token",
} satisfies PasswordResetEmailProps;

const headingStyle = {
  color: emailColors.charcoal,
  fontSize: "24px",
  fontWeight: "700",
  lineHeight: "32px",
  margin: "0 0 20px",
};

const textStyle = {
  color: emailColors.charcoal,
  fontSize: "16px",
  lineHeight: "24px",
  margin: "20px 0 20px",
};

const buttonStyle = {
  backgroundColor: emailColors.green,
  borderRadius: "6px",
  color: emailColors.charcoal,
  fontSize: "16px",
  fontWeight: "700",
  lineHeight: "20px",
  padding: "12px 20px",
  textDecoration: "none",
};

const linkStyle = {
  color: emailColors.gray,
  fontSize: "14px",
  lineHeight: "20px",
  overflowWrap: "anywhere" as const,
};

export function PasswordResetEmail({ resetUrl }: PasswordResetEmailProps) {
  return (
    <EmailLayout preview="Reset your Parcelis password">
      <Heading as="h1" className="parcelis-email-heading" style={headingStyle}>
        Reset your password
      </Heading>
      <Text className="parcelis-email-text" style={textStyle}>
        We received a request to reset your Parcelis password.
      </Text>
      <Button href={resetUrl} style={buttonStyle}>
        Reset password
      </Button>
      <Text className="parcelis-email-text" style={textStyle}>
        If you did not request a password reset, you can safely ignore this email.
      </Text>
      <Text className="parcelis-email-link" style={linkStyle}>
        If the button does not work, copy and paste this link into your browser:{" "}
        <Link className="parcelis-email-link" href={resetUrl}>
          {resetUrl}
        </Link>
      </Text>
    </EmailLayout>
  );
}

export default PasswordResetEmail;
