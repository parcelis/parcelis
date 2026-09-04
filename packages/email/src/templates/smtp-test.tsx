import { Heading, Text } from "react-email";
import { EmailLayout } from "../components/email-layout.js";
import { emailColors } from "../styles.js";

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
  margin: "20px 0",
};

export function SmtpTestEmail() {
  return (
    <EmailLayout preview="Your Parcelis SMTP configuration is working">
      <Heading as="h1" className="parcelis-email-heading" style={headingStyle}>
        SMTP configuration confirmed
      </Heading>
      <Text className="parcelis-email-text" style={textStyle}>
        Your organization’s SMTP configuration is working.
      </Text>
      <Text className="parcelis-email-text" style={textStyle}>
        This test was sent from the Email settings page.
      </Text>
    </EmailLayout>
  );
}

export default SmtpTestEmail;
