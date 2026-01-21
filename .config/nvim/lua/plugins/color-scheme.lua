return {
  {
    "sainnhe/gruvbox-material",
    lazy = false,
    priority = 1000,
    config = function()
      local theme_opts = {
        gruvbox_material_background = "hard",
        gruvbox_material_foreground = "material",
        gruvbox_material_disable_italic_comment = 1,
        gruvbox_material_enable_bold = 1,
        -- gruvbox_material_enable_italic = 0,
        gruvbox_material_transparent_background = 1,
        gruvbox_material_dim_inactive_windows = 0,
        gruvbox_material_visual = "reverse",
        gruvbox_material_float_style = "blend",
        gruvbox_material_cursor = "orange",
        gruvbox_material_diagnostic_text_highlight = 1,
        gruvbox_material_diagnostic_line_highlight = 1,
        gruvbox_material_diagnostic_virtual_text = "colored",
        gruvbox_material_inlay_hints_background = "dim",
        gruvbox_material_better_performance = 1,
      }
      for k, v in pairs(theme_opts) do
        vim.g[k] = v
      end
      vim.cmd("colorscheme gruvbox-material")
      local overide = {
        CursorLineNr = { link = "Red" },
        Visual = { bg = "#433e39" },
        BlinkCmpMenu = { link = "StdoutMsg" },
        BlinkCmpMenuBorder = { link = "FloatBorder" },
        BlinkCmpMenuSelection = { link = "Visual" },
        BlinkCmpSource = { link = "FloatBorder" },
        BlinkCmpLabelMatch = { link = "FloatTitle" },
        BlinkCmpDocBorder = { link = "FloatBorder" },
        BlinkCmpSignatureHelpBorder = { link = "FloatBorder" },
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
