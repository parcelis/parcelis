import type { PropsWithChildren } from "react";
import { Body, Container, Head, Html, Img, Link, Preview, Section, Text } from "react-email";
import { emailColors, emailDarkColors } from "../styles.js";

type EmailLayoutProps = PropsWithChildren<{
  preview: string;
}>;

const bodyStyle = {
  backgroundColor: emailColors.porcelain,
  backgroundImage: `linear-gradient(180deg, rgba(16, 28, 41, 0.04), rgba(247, 248, 246, 0) 320px)`,
  fontFamily: "Arial, sans-serif",
  margin: "0",
  padding: "32px 16px",
};

const containerStyle = {
  backgroundColor: emailColors.white,
  border: `1px solid ${emailColors.border}`,
  borderRadius: "8px",
  margin: "0 auto",
  maxWidth: "600px",
  overflow: "hidden",
};

const headerStyle = {
  backgroundColor: emailColors.charcoal,
  padding: "16px 32px",
};

const logoStyle = {
  borderRadius: "8px",
  display: "block",
  height: "40px",
  width: "40px",
};

const contentStyle = {
  padding: "32px",
};

const footerStyle = {
  color: emailColors.gray,
  fontSize: "12px",
  lineHeight: "18px",
  margin: "0",
  padding: "0 32px 28px",
};

const brandingContainerStyle = {
  margin: "0 auto",
  maxWidth: "600px",
  padding: "64px 0 0",
};

const issuedWithStyle = {
  color: emailColors.gray,
  fontSize: "12px",
  lineHeight: "18px",
  margin: "0 0 4px",
  textAlign: "center" as const,
};

const fullmarkStyle = {
  display: "block",
  height: "24px",
  margin: "0 auto",
  width: "94px",
};

const darkFullmarkStyle = {
  ...fullmarkStyle,
  display: "none",
};

const brandLinkStyle = {
  display: "block",
  textDecoration: "none",
};

const issuedWithLinkStyle = {
  color: "inherit",
  textDecoration: "none",
};

const emailOrigin = (process.env.WEB_ORIGIN ?? "http://localhost:30000").replace(/\/$/, "");
const parcelisUrl = "https://parcelis.dev";
const headerLogoUrl = `${emailOrigin}/brand/parcelis-dark-lettermark.png`;
const lightFullmarkUrl = `${emailOrigin}/brand/parcelis-fullmark-light.png`;
const darkFullmarkUrl = `${emailOrigin}/brand/parcelis-fullmark-dark.png`;

const darkThemeCss = `
  .parcelis-email-body,
  .parcelis-email-body > table > tbody > tr > td {
    background-color: ${emailColors.charcoal} !important;
    background-image: linear-gradient(180deg, rgba(111, 166, 64, 0.08), rgba(16, 28, 41, 0) 340px) !important;
  }
  .parcelis-email-header { background-color: ${emailDarkColors.surface} !important; }
  .parcelis-email-container {
    background-color: ${emailDarkColors.surface} !important;
    border-color: ${emailDarkColors.border} !important;
  }
  .parcelis-email-heading, .parcelis-email-text { color: ${emailDarkColors.text} !important; }
  .parcelis-email-footer, .parcelis-email-link, .parcelis-email-link a {
    color: ${emailDarkColors.mutedText} !important;
  }
  .parcelis-email-issued-with { color: ${emailDarkColors.mutedText} !important; }
  .parcelis-email-fullmark-light { display: none !important; }
  .parcelis-email-fullmark-dark { display: block !important; }
`;

export function EmailLayout({ children, preview }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <meta content="light dark" name="color-scheme" />
        <meta content="light dark" name="supported-color-schemes" />
        <style>{`
          :root { color-scheme: light dark; }

          @media (prefers-color-scheme: dark) {
            ${darkThemeCss}
          }

          ${darkThemeCss.replaceAll(".parcelis-email", "[data-ogsc] .parcelis-email")}
        `}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body className="parcelis-email-body" style={bodyStyle}>
        <Container className="parcelis-email-container" style={containerStyle}>
          <Section className="parcelis-email-header" style={headerStyle}>
            <Link href={parcelisUrl} style={brandLinkStyle}>
              <Img
                alt="Parcelis"
                height="40"
                src={headerLogoUrl}
                style={logoStyle}
                width="40"
              />
            </Link>
          </Section>
          <Section style={contentStyle}>{children}</Section>
          <Text className="parcelis-email-footer" style={footerStyle}>
            This is an automated message from Parcelis.
          </Text>
        </Container>
        <Container style={brandingContainerStyle}>
          <Text className="parcelis-email-issued-with" style={issuedWithStyle}>
            <Link href={parcelisUrl} style={issuedWithLinkStyle}>
              Issued with
            </Link>
          </Text>
          <Link href={parcelisUrl} style={brandLinkStyle}>
            <Img
              alt="Parcelis"
              className="parcelis-email-fullmark-light"
              height="24"
              src={lightFullmarkUrl}
              style={fullmarkStyle}
              width="94"
            />
          </Link>
          <Link href={parcelisUrl} style={brandLinkStyle}>
            <Img
              alt="Parcelis"
              className="parcelis-email-fullmark-dark"
              height="24"
              src={darkFullmarkUrl}
              style={darkFullmarkStyle}
              width="94"
            />
          </Link>
        </Container>
      </Body>
    </Html>
  );
}
