return {
  "folke/edgy.nvim",
  event = "VeryLazy",
  init = function()
    vim.opt.laststatus = 3
    vim.opt.splitkeep = "screen"
  end,
  opts = {
    icons = {
      closed = "  ",
      open = "  ",
    },
    animate = {
      enabled = false,
    },
    left = {
      {
        title = "Files",
        ft = "fyler",
        size = { width = 0.20 },
      },
      {
        title = "Symbols",
        ft = "aerial",
      },
      { title = "Neotest Summary", ft = "neotest-summary" },
    },
    right = {
      { ft = "grug-far", title = "Search", size = { width = 0.40 } },
      {
        ft = "sidekick_terminal",
        title = "AI",
        size = { width = 0.40 },
      },
    },
    bottom = {
      { ft = "qf", title = "QuickFix" },
      {
        ft = "help",
        size = { height = 0.40 },
        -- don't open help files in edgy that we're editing
        filter = function(buf)
          return vim.bo[buf].buftype == "help"
        end,
      },
      { title = "Neotest Output", ft = "neotest-output-panel", size = { height = 15 } },
    },
  },
}
