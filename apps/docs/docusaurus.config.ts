import type { Config } from "@docusaurus/types";

const config: Config = {
  title: "Parcelis Docs",
  tagline: "Property management, made practical.",
  url: "https://docs.parcelis.dev",
  baseUrl: "/",
  organizationName: "parcelis",
  projectName: "parcelis",
  onBrokenLinks: "throw",
  future: {
    faster: {
      swcJsLoader: true,
    },
  },
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "warn",
    },
  },
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },
  presets: [
    [
      "classic",
      {
        docs: {
          path: "content",
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          docItemComponent: "@theme/ApiItem",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      },
    ],
  ],
  plugins: [
    "docusaurus-plugin-copy-page-button",
    "docusaurus-plugin-sass",
    [
      "docusaurus-plugin-openapi-docs",
      {
        id: "openapi",
        docsPluginId: "classic",
        config: {
          parcelis: {
            specPath: "../api/openapi/parcelis.openapi.json",
            outputDir: "content/api-reference",
            sidebarOptions: {
              groupPathsBy: "tag",
              categoryLinkSource: "tag",
            },
          },
        },
      },
    ],
  ],
  themes: ["docusaurus-theme-openapi-docs"],
  themeConfig: {
    api: {
      schemaExpansion: {
        enabled: true,
        default: 1,
        max: 4,
      },
    },
    colorMode: {
      defaultMode: "light",
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "Parcelis Docs",
      logo: {
        alt: "Parcelis",
        src: "img/parcelis-dark.png",
        srcDark: "img/parcelis-light.png",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "docsSidebar",
          position: "left",
          label: "Documentation",
        },
        {
          to: "/api-reference/parcelis-api",
          label: "API Reference",
          position: "left",
        },
        {
          href: "https://github.com/parcelis/parcelis",
          label: "GitHub",
          className: "header-social-link header-github-link",
          position: "right",
        },
        {
          href: "https://discord.gg/4XYkWmVpWH",
          className: "header-social-link header-discord-link",
          label: "Discord",
          position: "right",
        },
        {
          href: "https://parcelis.dev",
          className: "header-social-link header-parcelis-link",
          label: "Parcelis",
          position: "right",
        },
            ],
    },
    /*
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [{ label: "Platform User Guide", to: "/" }],
        },
        {
          title: "Project",
          items: [
            { label: "GitHub", href: "https://github.com/parcelis/parcelis" },
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} Parcelis. Licensed under AGPL-3.0.`,
    },
    */
  },
};

export default config;
