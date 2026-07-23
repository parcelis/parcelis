import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: "category",
      label: "Platform User Guide",
      link: {
        type: "doc",
        id: "platform-user-guide"
      },
      items: [
        {
          type: "category",
          label: "Getting Started",
          items: [
            "platform-user-guide/getting-started/first-steps",
            "platform-user-guide/getting-started/portfolio-dashboard"
          ]
        },
        {
          type: "category",
          label: "Core Concepts",
          items: [
            "platform-user-guide/core-concepts/portfolio",
            "platform-user-guide/core-concepts/property",
            "platform-user-guide/core-concepts/unit",
            "platform-user-guide/core-concepts/lease",
            "platform-user-guide/core-concepts/maintenance-ticket"
          ]
        },
        {
          type: "category",
          label: "App Functionality",
          items: [
            "platform-user-guide/app-functionality/add-a-property",
            "platform-user-guide/app-functionality/property-directory",
            "platform-user-guide/app-functionality/manage-a-property",
            "platform-user-guide/app-functionality/unit-details",
            "platform-user-guide/app-functionality/property-details"
          ]
        },
        {
          type: "category",
          label: "Navigation And Preferences",
          items: [
            "platform-user-guide/navigation-and-preferences/sidebar",
            "platform-user-guide/navigation-and-preferences/collapse-navigation",
            "platform-user-guide/navigation-and-preferences/theme",
            "platform-user-guide/navigation-and-preferences/keyboard-shortcuts"
          ]
        },
        "platform-user-guide/pricing"
      ]
    },
    {
      type: "category",
      label: "For contributors",
      items: ["getting-started"]
    }
  ]
};

export default sidebars;
