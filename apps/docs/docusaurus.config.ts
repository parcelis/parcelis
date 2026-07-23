import type { Config } from "@docusaurus/types";

const config: Config = {
  title: "Parcelis Docs",
  tagline: "Property management, made practical.",
  url: "https://docs.parcelis.dev",
  baseUrl: "/",
  organizationName: "parcelis",
  projectName: "parcelis",
  onBrokenLinks: "throw",
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "warn"
    }
  },
  i18n: {
    defaultLocale: "en",
    locales: ["en"]
  },
  presets: [
    [
      "classic",
      {
        docs: {
          path: "content",
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts"
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css"
        }
      }
    ]
  ],
  themeConfig: {
    colorMode: {
      defaultMode: "light",
      respectPrefersColorScheme: true
    },
    navbar: {
      title: "Parcelis Docs",
      logo: {
        alt: "Parcelis",
        src: "img/parcelis-dark.png",
        srcDark: "img/parcelis-light.png"
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "docsSidebar",
          position: "left",
          label: "Documentation"
        },
        {
          href: "https://github.com/parcelis/parcelis",
          label: "GitHub",
          position: "right"
        }
      ]
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [{ label: "Platform User Guide", to: "/" }]
        },
        {
          title: "Project",
          items: [{ label: "GitHub", href: "https://github.com/parcelis/parcelis" }]
        }
      ],
      copyright: `Copyright ${new Date().getFullYear()} Parcelis. Licensed under AGPL-3.0.`
    }
  }
};

export default config;
