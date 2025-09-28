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
        -- `lazydev` configures Lua LSP for your Neovim config, runtime and plugins
        -- used for completion, annotations and signatures of Neovim apis
        "folke/lazydev.nvim",
        ft = "lua",
        opts = {
          library = {
            { path = "snacks.nvim", words = { "Snacks" } },
            { path = "lazy.nvim", words = { "LazyVim" } },
          },
        },
      },
      {
        "mason-org/mason.nvim",
        opts = {},
      },
      {
        "WhoIsSethDaniel/mason-tool-installer.nvim",
        opts = {
          ensure_installed = ensure_installed,
        },
      },
      { "j-hui/fidget.nvim", opts = {} },
      "b0o/schemastore.nvim",
    },
  },
  {
    "SmiteshP/nvim-navic",
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
      local function auto_close(win, group)
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
          auto_close(event.data.win, utils.create_autocmd("AutoCloseCodeActionWindow"))
        end,
      })
      vim.api.nvim_create_autocmd("User", {
        pattern = "TinyCodeActionWindowEnterPreview",
        callback = function(event)
          auto_close(event.data.win, utils.create_autocmd("AutoCloseCodeActionPreviewWindow"))
        end,
      })
    end,
    keys = {
      {
        "<leader>ca",
        mode = { "n", "x" },
        function()
          require("tiny-code-action").code_action({})
        end,
      },
    },
  },
  {
    "smjonas/inc-rename.nvim",
    opts = {
      input_buffer_type = "snacks",
    },
    keys = {
      { "<leader>rn", ":IncRename ", desc = "Rename", mode = { "n", "v" } },
    },
  },
  {
    "Wansmer/symbol-usage.nvim",
    event = "BufReadPre", -- need run before LspAttach if you use nvim 0.9. On 0.10 use 'LspAttach'
    config = function()
      local function h(name)
        return vim.api.nvim_get_hl(0, { name = name })
      end

      -- hl-groups can have any name
      vim.api.nvim_set_hl(0, "SymbolUsageRounding", { fg = h("CursorLine").bg, italic = true })
      vim.api.nvim_set_hl(0, "SymbolUsageContent", { bg = h("CursorLine").bg, fg = h("Comment").fg, italic = true })
      vim.api.nvim_set_hl(0, "SymbolUsageRef", { fg = h("Function").fg, bg = h("CursorLine").bg, italic = true })
      vim.api.nvim_set_hl(0, "SymbolUsageDef", { fg = h("Type").fg, bg = h("CursorLine").bg, italic = true })
      vim.api.nvim_set_hl(0, "SymbolUsageImpl", { fg = h("@keyword").fg, bg = h("CursorLine").bg, italic = true })

      local function text_format(symbol)
        local res = {}

        local round_start = { "", "SymbolUsageRounding" }
        local round_end = { "", "SymbolUsageRounding" }

        -- Indicator that shows if there are any other symbols in the same line
        local stacked_functions_content = symbol.stacked_count > 0 and ("+%s"):format(symbol.stacked_count) or ""

        if symbol.references then
          local usage = symbol.references <= 1 and "usage" or "usages"
          local num = symbol.references == 0 and "no" or symbol.references
          table.insert(res, round_start)
          table.insert(res, { "󰌹 ", "SymbolUsageRef" })
          table.insert(res, { ("%s %s"):format(num, usage), "SymbolUsageContent" })
          table.insert(res, round_end)
        end

        if symbol.definition then
          if #res > 0 then
            table.insert(res, { " ", "NonText" })
          end
          table.insert(res, round_start)
          table.insert(res, { "󰳽 ", "SymbolUsageDef" })
          table.insert(res, { symbol.definition .. " defs", "SymbolUsageContent" })
          table.insert(res, round_end)
        end

        if symbol.implementation then
          if #res > 0 then
            table.insert(res, { " ", "NonText" })
          end
          table.insert(res, round_start)
          table.insert(res, { "󰡱 ", "SymbolUsageImpl" })
          table.insert(res, { symbol.implementation .. " impls", "SymbolUsageContent" })
          table.insert(res, round_end)
        end

        if stacked_functions_content ~= "" then
          if #res > 0 then
            table.insert(res, { " ", "NonText" })
          end
          table.insert(res, round_start)
          table.insert(res, { " ", "SymbolUsageImpl" })
          table.insert(res, { stacked_functions_content, "SymbolUsageContent" })
          table.insert(res, round_end)
        end

        return res
      end

      require("symbol-usage").setup({
        text_format = text_format,
        references = { enabled = true, include_declaration = false },
        definition = { enabled = true },
        implementation = { enabled = true },
        -- disable = {
        -- 	cond = {
        -- 		function(bufnr)
        -- 			--  node_modules
        -- 			vim.notify("symbol-usage.nvim: skipping node_modules")
        -- 			return vim.api.nvim_buf_get_name(bufnr):find("node_modules")
        -- 		end,
        -- 	},
        -- },
      })
    end,
  },
  {
    "ravibrock/spellwarn.nvim",
    event = "VeryLazy",
    config = true,
  },
  {
    "m-demare/hlargs.nvim",
    opts = {},
    event = "VeryLazy",
  },
}
