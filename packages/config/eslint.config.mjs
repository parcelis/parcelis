import js from "@eslint/js";
import next from "@next/eslint-plugin-next";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export const base = [
  {
    ignores: [
      "**/.next/**",
      "**/coverage/**",
      "**/dist/**",
      "**/next-env.d.ts",
      "**/node_modules/**",
      "**/*.config.*"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,cjs,mjs,ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        ...globals.node
      },
      parserOptions: {
        sourceType: "module"
      }
    },
    rules: {
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_"
        }
      ],
      "@typescript-eslint/no-empty-object-type": [
        "error",
        {
          allowInterfaces: "with-single-extends"
        }
      ]
    }
  },
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs"
    }
  }
];

export const reactNext = [
  ...base,
  {
    files: ["**/*.{jsx,tsx}"],
    plugins: {
      react,
      "react-hooks": reactHooks
    },
    settings: {
      react: {
        version: "detect"
      }
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat["jsx-runtime"].rules,
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/rules-of-hooks": "error",
      "react/prop-types": "off"
    }
  },
  {
    files: ["apps/docs/**/*.{jsx,tsx}", "apps/web/**/*.{jsx,tsx}"],
    plugins: {
      "@next/next": next
    },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs["core-web-vitals"].rules
    }
  }
];

export default base;
