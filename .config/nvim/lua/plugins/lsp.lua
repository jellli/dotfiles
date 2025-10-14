local utils = require("utils")
---@diagnostic disable: missing-fields
local ensure_installed = {
  "rust-analyzer",
  "cssmodules-language-server",
  "html-lsp",
  "css-lsp",
  "tailwindcss-language-server",
  "emmet-ls",
  "stylua",
  "biome",
  "marksman",
  "typescript-language-server",
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
        "rust_analyzer",
        "jsonls",
        "yamlls",
        "css-variables-language-server",
      })
    end,
  },
  {
    "b0o/schemastore.nvim",
    event = "LspAttach",
    ft = { "json", "yaml" },
  },
  {
    -- `lazydev` configures Lua LSP for your Neovim config, runtime and plugins
    -- used for completion, annotations and signatures of Neovim apis
    "folke/lazydev.nvim",
    event = "LspAttach",
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
    "SmiteshP/nvim-navic",
    event = "LspAttach",
    opts = {
      separator = " ",
      highlight = true,
      depth_limit = 5,
      lazy_update_context = true,
    },
    init = function()
      vim.lsp.config("*", {
        ---@param client vim.lsp.Client
        ---@param bufnr integer
        on_attach = function(client, bufnr)
          if client:supports_method("textDocument/documentSymbol", bufnr) then
            require("nvim-navic").attach(client, bufnr)
          end
        end,
      })
    end,
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
      --[[ local function auto_close(win, group)
        vim.api.nvim_create_autocmd("CursorMoved", {
          group = group,
          pattern = "*",
          callback = function()
            local current_win = vim.api.nvim_get_current_win()
            if current_win ~= win then
              vim.api.nvim_clear_autocmds({ group = group })
              vim.defer_fn(function()
                pcall(vim.api.nvim_win_close, win, true)
              end, 200)
            end
          end,
        })
      end

      vim.api.nvim_create_autocmd("User", {
        pattern = "TinyCodeActionWindowEnterMain",
        callback = function(event)
          auto_close(event.data.win, utils.creat_group("AutoCloseCodeActionWindow"))
        end,
      })
      vim.api.nvim_create_autocmd("User", {
        pattern = "TinyCodeActionWindowEnterPreview",
        callback = function(event)
          auto_close(event.data.win, utils.creat_group("AutoCloseCodeActionPreviewWindow"))
        end,
      }) ]]
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
}
