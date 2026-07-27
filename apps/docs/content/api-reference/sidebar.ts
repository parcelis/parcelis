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
          label: "health",
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
          label: "properties-list",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/properties-create",
          label: "properties-create",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/properties-by-id",
          label: "properties-byId",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/properties-update",
          label: "properties-update",
          className: "api-method put",
        },
        {
          type: "doc",
          id: "api-reference/properties-delete",
          label: "properties-delete",
          className: "api-method delete",
        },
        {
          type: "doc",
          id: "api-reference/properties-create-image-upload-url",
          label: "properties-createImageUploadUrl",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/properties-complete-image-upload",
          label: "properties-completeImageUpload",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/properties-delete-image",
          label: "properties-deleteImage",
          className: "api-method delete",
        },
        {
          type: "doc",
          id: "api-reference/properties-archive",
          label: "properties-archive",
          className: "api-method patch",
        },
        {
          type: "doc",
          id: "api-reference/properties-inactivate",
          label: "properties-inactivate",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/properties-reactivate",
          label: "properties-reactivate",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/properties-update-notes",
          label: "properties-updateNotes",
          className: "api-method patch",
        },
      ],
    },
    {
      type: "category",
      label: "Tags",
      items: [
        {
          type: "doc",
          id: "api-reference/tags-list",
          label: "tags-list",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/tags-create",
          label: "tags-create",
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
          label: "unitOptions-list",
          className: "api-method get",
        },
      ],
    },
    {
      type: "category",
      label: "Amenities",
      items: [
        {
          type: "doc",
          id: "api-reference/amenities-list",
          label: "amenities-list",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/amenities-update",
          label: "amenities-update",
          className: "api-method put",
        },
      ],
    },
    {
      type: "category",
      label: "Units",
      items: [
        {
          type: "doc",
          id: "api-reference/units-list",
          label: "units-list",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/units-create",
          label: "units-create",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "api-reference/units-by-id",
          label: "units-byId",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "api-reference/units-update",
          label: "units-update",
          className: "api-method patch",
        },
        {
          type: "doc",
          id: "api-reference/units-delete",
          label: "units-delete",
          className: "api-method delete",
        },
      ],
    },
  ],
};

export default sidebar.apisidebar;
