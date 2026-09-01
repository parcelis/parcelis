export type EmailConfig = {
  from: string;
  host: string;
  password: string;
  port: number;
  secure: boolean;
  user: string;
};

// Retrieves and validates a required environment variable.
function getRequiredEnvironmentVariable(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} must be configured before sending email.`);
  }

  return value;
}

// Retrieves a required secret without altering its value.
function getRequiredSecret(name: string) {
  const value = process.env[name];

  if (!value?.trim()) {
    throw new Error(`${name} must be configured before sending email.`);
  }

  return value;
}

// Retrieves and validates the SMTP port from environment variables.
function getSmtpPort() {
  const value = getRequiredEnvironmentVariable("SMTP_PORT");
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT must be a valid TCP port number.");
  }

  return port;
}

// Retrieves and validates the SMTP secure flag from environment variables.
function getSmtpSecure() {
  const value = getRequiredEnvironmentVariable("SMTP_SECURE");

  if (value !== "true" && value !== "false") {
    throw new Error('SMTP_SECURE must be either "true" or "false".');
  }

  return value === "true";
}

// Retrieves and validates the complete email configuration from environment variables.
export function getEmailConfig(): EmailConfig {
  return {
    from: getRequiredEnvironmentVariable("EMAIL_FROM"),
    host: getRequiredEnvironmentVariable("SMTP_HOST"),
    password: getRequiredSecret("SMTP_PASSWORD"),
    port: getSmtpPort(),
    secure: getSmtpSecure(),
    user: getRequiredEnvironmentVariable("SMTP_USER"),
  };
}
