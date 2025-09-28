return {
  {
    "webhooked/kanso.nvim",
    lazy = false,
    priority = 1000,
    config = function()
      require("kanso").setup({
        ---@type fun(colors: KansoColorsSpec): table<string, table>
        ---@diagnostic disable-next-line: unused-local
        overrides = function(colors)
          return {
            CursorLineNr = { link = "Constant" },
            -- BlinkCmpMenuBorder = { link = "FloatBorder" },
            ["@variable"] = { fg = "#a7706a" },
          }
        end,
      })
      vim.cmd("colorscheme kanso-ink")
    end,
  },
}
