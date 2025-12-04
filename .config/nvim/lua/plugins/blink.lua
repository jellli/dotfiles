return {
  {
    "saghen/blink.cmp",
    event = { "InsertEnter", "CmdlineEnter" },
    opts_extend = { "sources.default", "cmdline.sources", "term.sources" },
    version = "*",
    opts = {
      snippets = { preset = "luasnip" },
      signature = { enabled = true },
      fuzzy = { implementation = "rust" },
      appearance = {
        use_nvim_cmp_as_default = false,
        nerd_font_variant = "mono",
        kind_icons = require("icons").symbol_kinds,
      },
      sources = {
        default = { "lsp", "snippets", "buffer", "path" },
        providers = {
          cmdline = {
            min_keyword_length = 2,
          },
          lsp = {
            name = "LSP",
            module = "blink.cmp.sources.lsp",
            fallbacks = { "buffer" },
            transform_items = function(_, items)
              -- filter out text items, since we have the buffer source
              return vim.tbl_filter(function(item)
                return item.kind ~= require("blink.cmp.types").CompletionItemKind.Text
              end, items)
            end,
          },
          path = {
            module = "blink.cmp.sources.path",
            score_offset = 3,
            fallbacks = { "buffer" },
          },
          buffer = {
            opts = {
              -- or (recommended) filter to only "normal" buffers
              get_bufnrs = function()
                return { vim.api.nvim_get_current_buf() }
              end,
            },
          },
        },
      },
      keymap = {
        ["<C-f>"] = {},
      },
      cmdline = {
        enabled = true,
        completion = { menu = { auto_show = true } },
        keymap = {
          ["<CR>"] = {},
        },
      },
      completion = {
        list = {
          selection = {
            auto_insert = true,
          },
        },
        ghost_text = {
          enabled = false,
        },
        menu = {
          border = vim.g.winborder,
          -- scrolloff = 1,
          -- scrollbar = false,
          draw = {
            treesitter = { "lsp" },
            columns = {
              { "kind_icon" },
              -- { "label", "label_description", gap = 1 },
              { "label", gap = 1 },
              { "kind" },
              { "source_name" },
            },
            components = {
              source_name = {
                text = function(ctx)
                  return "[" .. ctx.source_name .. "]"
                end,
              },
            },
          },
        },
        documentation = {
          window = {
            border = vim.g.winborder,
            scrollbar = false,
          },
          auto_show = true,
          auto_show_delay_ms = 200,
        },
      },
    },
  },
  {
    "L3MON4D3/LuaSnip",
    lazy = true,
    dependencies = "rafamadriz/friendly-snippets",
    opts = function()
      local loader = require("luasnip.loaders.from_vscode")
      loader.lazy_load()
      loader.lazy_load({ paths = { vim.fn.stdpath("config") .. "/snippets" } })
      return {
        history = true,
        delete_check_events = "TextChanged",
      }
    end,
    keys = function()
      -- Disable default tab keybinding in LuaSnip
      return {}
    end,
  },
}
