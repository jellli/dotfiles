local utils = require("utils")
return {
  "stevearc/conform.nvim",
  event = { "BufWritePre" },
  cmd = { "ConformInfo" },
  opts = function()
    local function get_web_formatter()
      local config_files = {
        ".prettierrc",
        ".prettierrc.json",
        ".prettierrc.js",
        "prettier.config.js",
        ".prettierrc.yaml",
        ".prettierrc.yml",
      }
      for _, config_file in ipairs(config_files) do
        if utils.check_file_in_cwd(config_file) then
          return "prettier"
        end
      end
      return "biome"
    end

    local web_formatter = get_web_formatter()

    local opts = {
      formatters_by_ft = {
        lua = { "stylua" },
        rust = { "rustfmt" },
      },
      format_on_save = {
        enabled = true,
        lsp_fallback = true,
        async = false,
      },
    }

    local webdev_langs = {
      "css",
      "html",
      "scss",
      "markdown",
      "javascript",
      "javascriptreact",
      "typescript",
      "typescriptreact",
      "astro",
    }

    for _, lang in ipairs(webdev_langs) do
      opts.formatters_by_ft[lang] = { web_formatter }
    end

    return opts
  end,
}
