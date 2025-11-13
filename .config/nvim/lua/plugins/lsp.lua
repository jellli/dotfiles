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
    lazy = true,
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
    "rachartier/tiny-code-action.nvim",
    event = "LspAttach",
    config = function()
      require("tiny-code-action").setup({
        picker = {
          "buffer",
          opts = {
            hotkeys = true,
            -- Use numeric labels.
            hotkeys_mode = function(titles)
              return vim
                .iter(ipairs(titles))
                :map(function(i)
                  return tostring(i)
                end)
                :totable()
            end,
          },
        },
      })
    end,
    keys = {
      {
        "<leader>ca",
        mode = { "n", "x" },
        desc = "Code Action",
        function()
          require("tiny-code-action").code_action({})
        end,
      },
    },
  },
  {
    "smjonas/inc-rename.nvim",
    event = "LspAttach",
    cmd = "IncRename",
    opts = {
      input_buffer_type = "snacks",
    },
    keys = {
      {
        "<leader>rn",
        function()
          local inc_rename = require("inc_rename")
          return ":" .. inc_rename.config.cmd_name .. " " .. vim.fn.expand("<cword>")
        end,
        expr = true,
        desc = "Rename (inc-rename.nvim)",
        mode = { "n", "v" },
      },
    },
  },
  {
    "Wansmer/symbol-usage.nvim",
    event = "LspAttach",
    config = true,
  },
  {
    "zeioth/garbage-day.nvim",
    dependencies = "neovim/nvim-lspconfig",
    event = "LspAttach",
    opts = {
      grace_period = 60 * 15, -- 15分钟
      wakeup_delay = 3000,
    },
  },
  {
    "j-hui/fidget.nvim",
    opts = {
      -- options
    },
  },
}
