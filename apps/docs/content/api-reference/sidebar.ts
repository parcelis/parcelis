import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebar: SidebarsConfig = {
  apisidebar: [
    {
      type: "doc",
      id: "api-reference/parcelis-api",
    },
    {
      type: "category",
      label: "System",
      items: [
        {
          type: "doc",
          id: "api-reference/health",
          label: "Check API health",
          className: "api-method get",
        },
      ],
    },
    {
      type: "category",
      label: "Properties",
      items: [
        {
          type: "doc",
          id: "api-reference/properties-list",
          label: "List properties",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/properties-by-id",
          label: "Get a property",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/properties-create",
          label: "Create a property",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/properties-update",
          label: "Update a property",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/properties-archive",
          label: "Archive a property",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/properties-delete",
          label: "Delete a property",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/properties-update-notes",
          label: "Update property notes",
          className: "api-method post",
        },
      ],
    },
    {
      type: "category",
      label: "Unit options",
      items: [
        {
          type: "doc",
          id: "api-reference/unit-options-list",
          label: "List unit options",
          className: "api-method get",
        },
      ],
    },
  ],
};

export default sidebar.apisidebar;
