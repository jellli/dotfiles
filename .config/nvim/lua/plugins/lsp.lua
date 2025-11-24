---@diagnostic disable: missing-fields
local ensure_installed = {
  "rust-analyzer",
  -- "bacon",
  -- "bacon-ls",

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

local function install_missing_lsp()
  local success, mason_registry = pcall(require, "mason-registry")
  if not success then
    vim.notify("mason-registry not found", vim.log.levels.ERROR)
    return
  end

  local function enable_lsp(p)
    if p.spec.neovim and p.spec.neovim.lspconfig then
      vim.lsp.enable(p.spec.neovim.lspconfig)
      return
    end
    vim.notify("LSP " .. p.name .. " does not have a neovim config, skipping", vim.log.levels.WARN)
  end

  local installed = mason_registry.get_installed_package_names()
  for _, package_name in ipairs(ensure_installed) do
    local p = mason_registry.get_package(package_name)
    if not vim.tbl_contains(installed, package_name) and vim.fn.executable(package_name) ~= 1 then
      p:install():once("install:success", function()
        enable_lsp(p)
      end)
      vim.notify("Installing missing lsp: " .. package_name, vim.log.levels.INFO)
    else
      enable_lsp(p)
    end
  end
end

--- @type LazySpec
return {
  {
    "neovim/nvim-lspconfig",
    event = { "BufReadPre", "BufNewFile" },
  },
  {
    "mason-org/mason.nvim",
    config = function()
      require("mason").setup()
      install_missing_lsp()
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
