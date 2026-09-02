import { Button, Heading, Link, Text } from "react-email";
import { EmailLayout } from "../components/email-layout.js";
import { emailColors } from "../styles.js";

export type VerificationEmailProps = {
  verificationUrl: string;
};

export const PreviewProps = {
  verificationUrl: "http://localhost:30000/login?mode=verify#token=preview-token",
} satisfies VerificationEmailProps;

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

export function VerificationEmail({ verificationUrl }: VerificationEmailProps) {
  return (
    <EmailLayout preview="Verify your Parcelis email">
      <Heading as="h1" className="parcelis-email-heading" style={headingStyle}>
        Verify your email
      </Heading>
      <Text className="parcelis-email-text" style={textStyle}>
        Confirm your email address to activate your Parcelis account.
      </Text>
      <Button href={verificationUrl} style={buttonStyle}>
        Verify email
      </Button>
      <Text className="parcelis-email-text" style={textStyle}>
        This link expires in 24 hours. If you did not create this account, you can safely ignore this email.
      </Text>
      <Text className="parcelis-email-link" style={linkStyle}>
        If the button does not work, copy and paste this link into your browser:{" "}
        <Link className="parcelis-email-link" href={verificationUrl}>
          {verificationUrl}
        </Link>
      </Text>
    </EmailLayout>
  );
}

export default VerificationEmail;
