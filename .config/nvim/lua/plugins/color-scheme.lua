return {
  {
    "sainnhe/gruvbox-material",
    lazy = false,
    priority = 1000,
    config = function()
      local theme_opts = {
        background = "hard",
        foreground = "material",
        disable_italic_comment = 1,
        enable_bold = 1,
        -- enable_italic = 0,
        transparent_background = 1,
        dim_inactive_windows = 0,
        visual = "reverse",
        float_style = "blend",
        cursor = "orange",
        diagnostic_text_highlight = 1,
        diagnostic_line_highlight = 1,
        diagnostic_virtual_text = "colored",
        inlay_hints_background = "dim",
        better_performance = 1,
      }
      for k, v in pairs(theme_opts) do
        vim.g["gruvbox_material_" .. k] = v
      end
      vim.cmd("colorscheme gruvbox-material")

      local overide = {
        Visual = { bg = "#433e39" },
        Directory = { link = "Special" },

        FloatBorder = { link = "Winseparator" },
        CursorLineNr = { link = "Red" },
        CurrentWord = { link = "Visual" },

        FlashMatch = { link = "DiagnosticWarn" },
        FlashCurrent = { link = "DiagnosticInfo" },
        FlashLabel = { link = "Cursor" },

        BlinkCmpMenu = { link = "StdoutMsg" },
        BlinkCmpMenuSelection = { link = "Visual" },

        BlinkCmpSource = { link = "Comment" },
        BlinkCmpLabelMatch = { link = "FloatTitle" },

        BlinkCmpMenuBorder = { link = "FloatBorder" },
        BlinkCmpDocBorder = { link = "FloatBorder" },
        BlinkCmpSignatureHelpBorder = { link = "FloatBorder" },

        CodeCompanionChatInfoBanner = { link = "Substitute" },
      }
      for k, v in pairs(overide) do
        vim.api.nvim_set_hl(0, k, v)
      end
    end,
  },
  {
    "webhooked/kanso.nvim",
    lazy = false,
    priority = 1000,
    config = function()
      require("kanso").setup({
        italics = false,
        ---@type fun(colors: KansoColorsSpec): table<string, table>
        ---@diagnostic disable-next-line: unused-local
        overrides = function(colors)
          return {
            Winseparator = { link = "FloatBorder" },
            CursorLineNr = { link = "Constant" },
            BlinkCmpMenuBorder = { link = "Comment" },
            ["@variable"] = { fg = "#a7706a" },
          }
        end,
      })
      -- vim.cmd("colorscheme kanso-ink")
    end,
  },
}
