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
        title = "Symbols",
        ft = "aerial",
        pinned = true,
        open = "AerialOpen",
      },
    },
    right = {
      { ft = "grug-far", title = "Search", size = { width = 0.40 } },
      {
        ft = "sidekick_terminal",
        title = "AI",
        size = { width = 0.40 },
      },
      {
        ft = "help",
        size = { width = 0.40 },
        -- don't open help files in edgy that we're editing
        filter = function(buf)
          return vim.bo[buf].buftype == "help"
        end,
      },
    },
    bottom = {
      { ft = "qf", title = "QuickFix" },
    },
  },
}
