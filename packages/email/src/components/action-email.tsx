import { Button, Heading, Link, Text } from "react-email";
import type { ReactNode } from "react";
import { EmailLayout } from "./email-layout.js";
import { emailColors } from "../styles.js";

type ActionEmailProps = {
  actionLabel: string;
  children: ReactNode;
  heading: string;
  preview: string;
  url: string;
};

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

export function ActionEmail({ actionLabel, children, heading, preview, url }: ActionEmailProps) {
  return (
    <EmailLayout preview={preview}>
      <Heading as="h1" className="parcelis-email-heading" style={headingStyle}>
        {heading}
      </Heading>
      {children}
      <Button href={url} style={buttonStyle}>
        {actionLabel}
      </Button>
      <Text className="parcelis-email-link" style={linkStyle}>
        If the button does not work, copy and paste this link into your browser: {" "}
        <Link className="parcelis-email-link" href={url}>
          {url}
        </Link>
      </Text>
    </EmailLayout>
  );
}

export function ActionEmailText({ children }: { children: ReactNode }) {
  return (
    <Text className="parcelis-email-text" style={textStyle}>
      {children}
    </Text>
  );
}
