---@diagnostic disable: missing-fields
local ensure_installed = {
  "rust-analyzer",
  "bacon",
  "bacon-ls",

  "cssmodules-language-server",
  "html-lsp",
  "css-lsp",
  "tailwindcss-language-server",
  "emmet-ls",
  "biome",
  "vtsls",

  "stylua",
  "marksman",
  "lua-language-server",
}
--- @type LazySpec
return {
  {
    "neovim/nvim-lspconfig",
    event = { "BufReadPre", "BufNewFile" },
    dependencies = {
      {
        "mason-org/mason.nvim",
        config = true,
      },
      {
        "WhoIsSethDaniel/mason-tool-installer.nvim",
        opts = {
          ensure_installed = ensure_installed,
        },
      },
    },
    config = function()
      vim.lsp.enable({
        "lua_ls",
        "vtsls",
        -- "tsgo",
        "cssls",
        "cssmodules_ls",
        "emmet_ls",
        "marksman",
        "zls",
        "biome",
        "tailwindcss",
        -- "rust_analyzer",
        "jsonls",
        "yamlls",
        "css-variables-language-server",
        -- "bacon_ls",
      })
    end,
  },
  {
    "b0o/schemastore.nvim",
    ft = { "json", "yaml" },
  },
  {
    -- `lazydev` configures Lua LSP for your Neovim config, runtime and plugins
    -- used for completion, annotations and signatures of Neovim apis
    "folke/lazydev.nvim",
    ft = "lua",
    opts = {
      library = {
        { path = "snacks.nvim", words = { "Snacks" } },
        { path = "lazy.nvim", words = { "LazyVim" } },
        { path = vim.fn.stdpath("data") .. "/LuaAddons/love2d/library" },
      },
    },
  },
  {
    "Wansmer/symbol-usage.nvim",
    event = "LspAttach",
    config = true,
  },
  {
    "j-hui/fidget.nvim",
    opts = {
      -- options
    },
  },
}
