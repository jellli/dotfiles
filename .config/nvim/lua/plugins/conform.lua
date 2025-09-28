return {
  "stevearc/conform.nvim",
  event = { "BufWritePre" },
  cmd = { "ConformInfo" },
  keys = {
    {
      "<leader>fd",
      function()
        require("conform").format({ async = true, lsp_format = "fallback" })
      end,
      mode = "",
      desc = "[F]ormat [D]ocument",
    },
  },
  config = function()
    local conform = require("conform")
    local webdev_opts = {
      stop_after_first = true,
      "biome",
      "prettier",
    }
    conform.setup({
      formatters_by_ft = {
        lua = { "stylua" },
        rust = { "rustfmt" },
        css = webdev_opts,
        html = webdev_opts,
        scss = webdev_opts,
        markdown = webdev_opts,

        ["javascript"] = webdev_opts,
        ["javascriptreact"] = webdev_opts,
        ["typescript"] = webdev_opts,
        ["typescriptreact"] = webdev_opts,
      },
      format_on_save = {
        enabled = true,
        lsp_fallback = true,
        async = false,
      },
    })
  end,
}
