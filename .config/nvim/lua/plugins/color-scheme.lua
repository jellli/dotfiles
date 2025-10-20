return {
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
      vim.cmd("colorscheme kanso-ink")
    end,
  },
}
