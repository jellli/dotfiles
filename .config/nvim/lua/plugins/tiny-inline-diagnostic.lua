return {
  "rachartier/tiny-inline-diagnostic.nvim",
  event = "LspAttach",
  commit = "29315861711f11daf75e1cf0953ab92ec1a3e69f",
  priority = 1000,
  config = function()
    require("tiny-inline-diagnostic").setup({
      preset = "ghost",
      -- transparent_bg = true,
      options = {
        show_source = true,
        show_all_diags_on_cursorline = true,
        multilines = {
          enabled = true,
          always_show = true,
        },
      },
    })
    vim.diagnostic.config({ virtual_text = false }) -- Only if needed in your configuration, if you already have native LSP diagnostics
  end,
}
