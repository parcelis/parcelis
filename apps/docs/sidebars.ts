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
