return {
  cmd = { "emmet-ls", "--stdio" },
  filetypes = {
    "astro",
    "css",
    "eruby",
    "html",
    "htmlangular",
    "htmldjango",
    "javascriptreact",
    "less",
    "pug",
    "sass",
    "scss",
    "svelte",
    "templ",
    "typescriptreact",
    "vue",
  },
  root_markers = { ".git" },
  ---
  init_options = {
    jsx = {
      options = {
        ["jsx.enabled"] = true,
        ["markup.attributes"] = {
          ["class"] = "className",
          ["class*"] = "className",
          ["for"] = "htmlFor",
        },
        ["markup.valuePrefix"] = {
          ["class*"] = "styles",
        },
      },
    },
  },
}
