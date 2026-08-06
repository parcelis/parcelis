import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";
import apiSidebar from "./content/api-reference/sidebar";

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: "category",
      label: "Platform User Guide",
      link: {
        type: "doc",
        id: "platform-user-guide",
      },
      items: [
        {
          type: "category",
          label: "Getting Started",
          items: [
            "platform-user-guide/getting-started/first-steps",
            "platform-user-guide/getting-started/sign-in",
            "platform-user-guide/getting-started/portfolio-dashboard",
          ],
        },
        {
          type: "category",
          label: "Core Concepts",
          items: [
            "platform-user-guide/core-concepts/portfolio",
            "platform-user-guide/core-concepts/property",
            "platform-user-guide/core-concepts/unit",
            "platform-user-guide/core-concepts/tenant",
            "platform-user-guide/core-concepts/notes",
            "platform-user-guide/core-concepts/lease",
            "platform-user-guide/core-concepts/maintenance-ticket",
          ],
        },
        {
          type: "category",
          label: "App Functionality",
          items: [
            "platform-user-guide/app-functionality/add-a-property",
            "platform-user-guide/app-functionality/property-directory",
            "platform-user-guide/app-functionality/manage-a-property",
            "platform-user-guide/app-functionality/unit-details",
            "platform-user-guide/app-functionality/property-details",
            "platform-user-guide/app-functionality/maintenance",
            "platform-user-guide/app-functionality/add-a-tenant",
            "platform-user-guide/app-functionality/tenant-directory",
            "platform-user-guide/app-functionality/manage-a-tenant",
            "platform-user-guide/app-functionality/tenant-details",
          ],
        },
        {
          type: "category",
          label: "Navigation And Preferences",
          items: [
            "platform-user-guide/navigation-and-preferences/sidebar",
            "platform-user-guide/navigation-and-preferences/users",
            "platform-user-guide/navigation-and-preferences/collapse-navigation",
            "platform-user-guide/navigation-and-preferences/theme",
            "platform-user-guide/navigation-and-preferences/keyboard-shortcuts",
          ],
        },
        "platform-user-guide/pricing",
      ],
    },
    {
      type: "category",
      label: "For contributors",
      items: ["getting-started", "contributing/commit-conventions"],
    },
    {
      type: "category",
      label: "API Reference",
      items: apiSidebar,
    },
  ],
};

export default sidebars;
