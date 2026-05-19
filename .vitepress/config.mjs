import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Cybervisor",
  description: "Autonomous AI development pipeline supervisor",
  srcDir: "docs",
  cleanUrls: true,

  head: [["link", { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }]],

  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "Getting Started", link: "/getting-started" },
      { text: "Configuration", link: "/configuration" },
      { text: "Runtime", items: [
        { text: "User Guide", link: "/runtime-user" },
        { text: "Developer Reference", link: "/runtime-internals" },
        { text: "WebSocket Protocol", link: "/websocket-protocol" },
      ]},
      { text: "Contributing", items: [
        { text: "Development", link: "/development" },
        { text: "Adding an Adapter", link: "/contributing/adding-an-adapter" },
      ]},
    ],

    sidebar: [
      {
        text: "Introduction",
        items: [
          { text: "Overview", link: "/" },
        ],
      },
      {
        text: "User Guides",
        items: [
          { text: "Getting Started", link: "/getting-started" },
          { text: "Configuration Reference", link: "/configuration" },
          { text: "Pipeline Authoring Guide", link: "/pipeline-authoring" },
          { text: "Runtime and Daemon (User Guide)", link: "/runtime-user" },
          { text: "Updating cybervisor", link: "/updating" },
          { text: "Shell Completions", link: "/completions" },
          { text: "Troubleshooting", link: "/troubleshooting" },
          { text: "Testing and Sandbox", link: "/testing" },
        ],
      },
      {
        text: "Developer Guides",
        items: [
          { text: "Runtime and Daemon (Developer Reference)", link: "/runtime-internals" },
          { text: "Updating (Developer Reference)", link: "/updating-dev" },
          { text: "Development", link: "/development" },
          { text: "Adding an Adapter", link: "/contributing/adding-an-adapter" },
          { text: "WebSocket Protocol", link: "/websocket-protocol" },
        ],
      },
    ],

    search: {
      provider: "local",
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/crzidea/cybervisor" },
    ],

    editLink: {
      pattern:
        "https://github.com/crzidea/cybervisor/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
  },
});